;; InvoiceBTC MVP escrow-backed invoice factoring contract.

(define-constant contract-self (as-contract tx-sender))

(use-trait sip-010-token .sip-010-trait.sip-010-trait)

(define-constant invoice-draft u0)
(define-constant invoice-merchant-signed u1)
(define-constant invoice-client-signed u2)
(define-constant invoice-escrow-funded u3)
(define-constant invoice-active u4)
(define-constant invoice-funded-by-lp invoice-active)
(define-constant invoice-matured u5)
(define-constant invoice-dispute u6)
(define-constant invoice-completed u7)
(define-constant invoice-cancelled u8)

(define-constant milestone-pending u0)
(define-constant milestone-funded u1)
(define-constant milestone-completion-submitted u2)
(define-constant milestone-merchant-requested milestone-completion-submitted)
(define-constant milestone-approved u3)
(define-constant milestone-disputed u4)
(define-constant milestone-settled u5)
(define-constant milestone-repaid-to-lp milestone-settled)
(define-constant milestone-cancelled u6)

(define-constant err-not-found (err u100))
(define-constant err-not-merchant (err u101))
(define-constant err-not-client (err u102))
(define-constant err-not-party (err u103))
(define-constant err-invalid-state (err u104))
(define-constant err-duplicate-signature (err u105))
(define-constant err-invalid-milestones (err u106))
(define-constant err-invalid-total (err u107))
(define-constant err-invalid-funding (err u108))
(define-constant err-already-funded (err u109))
(define-constant err-invalid-milestone-state (err u110))
(define-constant err-not-lp-funded (err u111))
(define-constant err-too-early (err u112))
(define-constant err-no-leftover (err u113))
(define-constant err-deadline-passed (err u114))
(define-constant err-deadline-invalid (err u115))
(define-constant err-transfer-failed (err u116))
(define-constant err-close-blocked (err u117))
(define-constant err-not-lp (err u118))
(define-constant err-caller-is-merchant (err u119))
(define-constant err-caller-is-client (err u120))

(define-data-var next-invoice-id uint u0)

(define-map invoices
  uint
  {
    merchant: principal,
    client: principal,
    lp: (optional principal),
    face-value: uint,
    total-lp-funding: uint,
    status: uint,
    created-at: uint,
    funding-deadline: uint,
    maturity-height: uint,
    metadata-hash: (buff 32),
    merchant-signed: bool,
    client-signed: bool,
    milestone-count: uint,
    total-lp-advanced: uint,
    total-escrowed: uint,
    total-settled: uint,
    total-refunded: uint
  }
)

(define-map milestones
  { invoice-id: uint, milestone-id: uint }
  {
    face-value: uint,
    merchant-payout-amount: uint,
    lp-repayment-amount: uint,
    due-block-height: uint,
    proof-hash: (optional (buff 32)),
    state: uint
  }
)

(define-read-only (get-invoice (invoice-id uint))
  (map-get? invoices invoice-id)
)

(define-read-only (get-milestone (invoice-id uint) (milestone-id uint))
  (map-get? milestones { invoice-id: invoice-id, milestone-id: milestone-id })
)

(define-read-only (get-invoice-summary (invoice-id uint))
  (match (map-get? invoices invoice-id)
    invoice
    (some {
      invoice-id: invoice-id,
      status: (get status invoice),
      merchant: (get merchant invoice),
      client: (get client invoice),
      lp: (get lp invoice),
      face-value: (get face-value invoice),
      total-lp-funding: (get total-lp-funding invoice),
      total-lp-advanced: (get total-lp-advanced invoice),
      total-escrowed: (get total-escrowed invoice),
      total-settled: (get total-settled invoice),
      total-refunded: (get total-refunded invoice),
      milestone-count: (get milestone-count invoice)
    })
    none
  )
)

(define-read-only (get-last-invoice-id)
  (var-get next-invoice-id)
)

(define-read-only (can-fund (invoice-id uint))
  (match (map-get? invoices invoice-id)
    invoice
    (ok
      (and
        (or
          (is-eq (get status invoice) invoice-escrow-funded)
          (is-eq (get status invoice) invoice-active)
        )
        ;; MVP: funding window is informational only - deadline does not block funding
        (is-eq (get total-escrowed invoice) (get face-value invoice))
      )
    )
    err-not-found
  )
)

(define-read-only (can-settle (invoice-id uint) (milestone-id uint))
  (let (
      (invoice-opt (map-get? invoices invoice-id))
      (milestone-opt (map-get? milestones { invoice-id: invoice-id, milestone-id: milestone-id }))
    )
    (match invoice-opt
      invoice
      (match milestone-opt
        milestone
        (ok
          (and
            (or
              (is-eq (get status invoice) invoice-funded-by-lp)
              (is-eq (get status invoice) invoice-active)
            )
            (is-some (get lp invoice))
            ;; MVP: maturity height is informational only - settlement allowed anytime
            (< (get total-settled invoice) (get face-value invoice))
            (not
              (or
                (is-eq (get state milestone) milestone-repaid-to-lp)
                (is-eq (get state milestone) milestone-cancelled)
              )
            )
          )
        )
        err-not-found
      )
      err-not-found
    )
  )
)

(define-private (sum-uints (values (list 20 uint)))
  (fold + values u0)
)

(define-private (get-existing-invoice (invoice-id uint))
  (match (map-get? invoices invoice-id)
    invoice (ok invoice)
    err-not-found
  )
)

(define-private (get-existing-milestone (invoice-id uint) (milestone-id uint))
  (match (map-get? milestones { invoice-id: invoice-id, milestone-id: milestone-id })
    milestone (ok milestone)
    err-not-found
  )
)

(define-private (assert-merchant (invoice-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (asserts! (is-eq tx-sender (get merchant invoice)) err-not-merchant)
      (ok true)
    )
  )
)

(define-private (assert-client (invoice-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (asserts! (is-eq tx-sender (get client invoice)) err-not-client)
      (ok true)
    )
  )
)

(define-private (assert-party (invoice-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (asserts!
        (or
          (is-eq tx-sender (get merchant invoice))
          (is-eq tx-sender (get client invoice))
        )
        err-not-party
      )
      (ok true)
    )
  )
)

(define-private (assert-lp (invoice-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (asserts!
        (match (get lp invoice)
          lp-principal (is-eq tx-sender lp-principal)
          false
        )
        err-not-lp
      )
      (ok true)
    )
  )
)

(define-private (invoice-sign-status (merchant-signed bool) (client-signed bool))
  (if merchant-signed
    (if client-signed invoice-client-signed invoice-merchant-signed)
    (if client-signed invoice-client-signed invoice-draft)
  )
)

(define-private (resolved-milestone-state (state uint))
  (or
    (is-eq state milestone-repaid-to-lp)
    (is-eq state milestone-disputed)
    (is-eq state milestone-cancelled)
  )
)

(define-private (store-milestone-at
  (invoice-id uint)
  (index uint)
  (count uint)
  (maturity-height uint)
  (face-values (list 20 uint))
  (merchant-payouts (list 20 uint))
  (lp-repayments (list 20 uint))
  (due-heights (list 20 uint))
)
  (if (>= index count)
    (ok true)
    (let (
        (milestone-id (+ index u1))
        (face-value (unwrap-panic (element-at face-values index)))
        (merchant-payout (unwrap-panic (element-at merchant-payouts index)))
        (lp-repayment (unwrap-panic (element-at lp-repayments index)))
        (due-height (unwrap-panic (element-at due-heights index)))
      )
      (begin
        (asserts! (> face-value u0) err-invalid-milestones)
        (asserts! (> merchant-payout u0) err-invalid-milestones)
        ;; MVP: due heights are informational only - no block height validation
        (asserts! (is-eq face-value lp-repayment) err-invalid-total)
        (map-set milestones
          { invoice-id: invoice-id, milestone-id: milestone-id }
          {
            face-value: face-value,
            merchant-payout-amount: merchant-payout,
            lp-repayment-amount: lp-repayment,
            due-block-height: due-height,
            proof-hash: none,
            state: milestone-pending
          }
        )
        (ok true)
      )
    )
  )
)

(define-private (cancel-open-milestone-at (invoice-id uint) (index uint) (count uint))
  (if (>= index count)
    (ok true)
    (let (
        (milestone-id (+ index u1))
        (milestone (try! (get-existing-milestone invoice-id (+ index u1))))
        (state (get state milestone))
      )
      (begin
        (if (resolved-milestone-state state)
          true
          (map-set milestones
            { invoice-id: invoice-id, milestone-id: milestone-id }
            (merge milestone { state: milestone-cancelled })
          )
        )
        (ok true)
      )
    )
  )
)

(define-private (milestone-resolved-at (invoice-id uint) (index uint) (count uint))
  (if (>= index count)
    true
    (match (map-get? milestones { invoice-id: invoice-id, milestone-id: (+ index u1) })
      milestone (resolved-milestone-state (get state milestone))
      false
    )
  )
)

(define-private (milestone-approved-or-settled-at (invoice-id uint) (index uint) (count uint))
  (if (>= index count)
    true
    (match (map-get? milestones { invoice-id: invoice-id, milestone-id: (+ index u1) })
      milestone
      (or
        (is-eq (get state milestone) milestone-approved)
        (is-eq (get state milestone) milestone-repaid-to-lp)
      )
      false
    )
  )
)

(define-private (previous-milestone-cleared (invoice-id uint) (milestone-id uint))
  (if (is-eq milestone-id u1)
    true
    (match (map-get? milestones { invoice-id: invoice-id, milestone-id: (- milestone-id u1) })
      milestone
      (or
        (is-eq (get state milestone) milestone-approved)
        (is-eq (get state milestone) milestone-settled)
      )
      false
    )
  )
)

(define-private (approved-unsettled-repayment-at (invoice-id uint) (index uint) (count uint))
  (if (>= index count)
    u0
    (match (map-get? milestones { invoice-id: invoice-id, milestone-id: (+ index u1) })
      milestone
      (if (is-eq (get state milestone) milestone-approved)
        (get lp-repayment-amount milestone)
        u0
      )
      u0
    )
  )
)

(define-private (milestone-needs-dispute-at (invoice-id uint) (index uint) (count uint))
  (if (>= index count)
    false
    (match (map-get? milestones { invoice-id: invoice-id, milestone-id: (+ index u1) })
      milestone
      (or
        (is-eq (get state milestone) milestone-pending)
        (is-eq (get state milestone) milestone-funded)
        (is-eq (get state milestone) milestone-completion-submitted)
        (is-eq (get state milestone) milestone-cancelled)
        (is-eq (get state milestone) milestone-disputed)
      )
      false
    )
  )
)

(define-private (settle-approved-milestone-at (invoice-id uint) (index uint) (count uint))
  (if (>= index count)
    (ok true)
    (let (
        (milestone-id (+ index u1))
        (milestone (try! (get-existing-milestone invoice-id (+ index u1))))
      )
      (begin
        (if (is-eq (get state milestone) milestone-approved)
          (map-set milestones
            { invoice-id: invoice-id, milestone-id: milestone-id }
            (merge milestone { state: milestone-repaid-to-lp })
          )
          true
        )
        (ok true)
      )
    )
  )
)

(define-private (dispute-unapproved-milestone-at (invoice-id uint) (index uint) (count uint))
  (if (>= index count)
    (ok true)
    (let (
        (milestone-id (+ index u1))
        (milestone (try! (get-existing-milestone invoice-id (+ index u1))))
        (state (get state milestone))
      )
      (begin
        (if
          (or
            (is-eq state milestone-pending)
            (is-eq state milestone-funded)
            (is-eq state milestone-completion-submitted)
            (is-eq state milestone-cancelled)
            (is-eq state milestone-disputed)
          )
          (map-set milestones
            { invoice-id: invoice-id, milestone-id: milestone-id }
            (merge milestone { state: milestone-disputed })
          )
          true
        )
        (ok true)
      )
    )
  )
)

(define-private (transfer-sbtc (amount uint) (sender principal) (recipient principal))
  (begin
    (unwrap! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer amount sender recipient none) err-transfer-failed)
    (ok true)
  )
)

(define-public (create-invoice
  (client principal)
  (face-value uint)
  (funding-deadline uint)
  (maturity-height uint)
  (metadata-hash (buff 32))
  (milestone-face-values (list 20 uint))
  (milestone-merchant-payouts (list 20 uint))
  (milestone-lp-repayments (list 20 uint))
  (milestone-due-heights (list 20 uint))
)
  (let (
      (milestone-count (len milestone-face-values))
      (merchant tx-sender)
      (invoice-id (+ (var-get next-invoice-id) u1))
      (milestone-face-total (sum-uints milestone-face-values))
      (merchant-payout-total (sum-uints milestone-merchant-payouts))
      (lp-repayment-total (sum-uints milestone-lp-repayments))
    )
    (begin
      (asserts! (> milestone-count u0) err-invalid-milestones)
      (asserts! (is-eq milestone-count (len milestone-merchant-payouts)) err-invalid-milestones)
      (asserts! (is-eq milestone-count (len milestone-lp-repayments)) err-invalid-milestones)
      (asserts! (is-eq milestone-count (len milestone-due-heights)) err-invalid-milestones)
      ;; MVP: funding-deadline and maturity-height are informational only - no block height validation
      (asserts! (is-eq milestone-face-total face-value) err-invalid-total)
      (asserts! (is-eq lp-repayment-total face-value) err-invalid-total)
      (try! (store-milestone-at invoice-id u0 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u1 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u2 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u3 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u4 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u5 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u6 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u7 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u8 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u9 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u10 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u11 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u12 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u13 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u14 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u15 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u16 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u17 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u18 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (try! (store-milestone-at invoice-id u19 milestone-count maturity-height milestone-face-values milestone-merchant-payouts milestone-lp-repayments milestone-due-heights))
      (map-set invoices invoice-id
        {
          merchant: merchant,
          client: client,
          lp: none,
          face-value: face-value,
          total-lp-funding: merchant-payout-total,
          status: invoice-draft,
          created-at: burn-block-height,
          funding-deadline: funding-deadline,
          maturity-height: maturity-height,
          metadata-hash: metadata-hash,
          merchant-signed: false,
          client-signed: false,
          milestone-count: milestone-count,
          total-lp-advanced: u0,
          total-escrowed: u0,
          total-settled: u0,
          total-refunded: u0
        }
      )
      (var-set next-invoice-id invoice-id)
      (ok invoice-id)
    )
  )
)

(define-public (merchant-sign-invoice (invoice-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (asserts! (is-eq tx-sender (get merchant invoice)) err-not-merchant)
      (asserts!
        (or
          (is-eq (get status invoice) invoice-draft)
          (is-eq (get status invoice) invoice-client-signed)
          (is-eq (get status invoice) invoice-merchant-signed)
        )
        err-invalid-state
      )
      (asserts! (not (get merchant-signed invoice)) err-duplicate-signature)
      (map-set invoices invoice-id
        (merge invoice
          {
            merchant-signed: true,
            status: (invoice-sign-status true (get client-signed invoice))
          }
        )
      )
      (ok true)
    )
  )
)

(define-public (client-sign-invoice (invoice-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (asserts! (is-eq tx-sender (get client invoice)) err-not-client)
      (asserts!
        (or
          (is-eq (get status invoice) invoice-draft)
          (is-eq (get status invoice) invoice-merchant-signed)
          (is-eq (get status invoice) invoice-client-signed)
        )
        err-invalid-state
      )
      (asserts! (not (get client-signed invoice)) err-duplicate-signature)
      (map-set invoices invoice-id
        (merge invoice
          {
            client-signed: true,
            status: invoice-client-signed
          }
        )
      )
      (ok true)
    )
  )
)

(define-public (fund-escrow (invoice-id uint) (amount uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (try! (assert-client invoice-id))
      (asserts! (get merchant-signed invoice) err-invalid-state)
      (asserts! (get client-signed invoice) err-invalid-state)
      (asserts!
        (or
          (is-eq (get status invoice) invoice-merchant-signed)
          (is-eq (get status invoice) invoice-client-signed)
        )
        err-invalid-state
      )
      (asserts! (is-eq (get total-escrowed invoice) u0) err-invalid-funding)
      (asserts! (is-eq amount (get face-value invoice)) err-invalid-funding)
      (try! (transfer-sbtc amount tx-sender contract-self))
      (map-set invoices invoice-id
        (merge invoice
          {
            total-escrowed: amount,
            status: invoice-escrow-funded
          }
        )
      )
      (ok true)
    )
  )
)

(define-public (fund-milestone (invoice-id uint) (milestone-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (let (
        (milestone (try! (get-existing-milestone invoice-id milestone-id)))
        (advance-amount (get merchant-payout-amount milestone))
      )
      (begin
        (asserts!
          (or
            (is-eq (get status invoice) invoice-escrow-funded)
            (is-eq (get status invoice) invoice-active)
          )
          err-invalid-state
        )
        ;; MVP: funding window is informational only - deadline does not block funding
        (asserts! (is-eq (get total-escrowed invoice) (get face-value invoice)) err-invalid-state)
        (asserts! (is-eq (get state milestone) milestone-pending) err-invalid-milestone-state)
        (asserts! (previous-milestone-cleared invoice-id milestone-id) err-invalid-state)
        ;; One role per invoice: caller must not already be merchant or client
        (asserts! (not (is-eq tx-sender (get merchant invoice))) err-caller-is-merchant)
        (asserts! (not (is-eq tx-sender (get client invoice))) err-caller-is-client)
        ;; LP exclusivity: if an LP is already assigned, only that LP may fund
        (asserts!
          (if (is-none (get lp invoice))
            true
            (match (get lp invoice) existing-lp (is-eq existing-lp tx-sender) false)
          )
          err-not-lp
        )
        (try! (transfer-sbtc advance-amount tx-sender (get merchant invoice)))
        (map-set milestones
          { invoice-id: invoice-id, milestone-id: milestone-id }
          (merge milestone { state: milestone-funded })
        )
        (map-set invoices invoice-id
          (merge invoice
            {
              lp: (some tx-sender),
              total-lp-advanced: (+ (get total-lp-advanced invoice) advance-amount),
              status: invoice-active
            }
          )
        )
        (ok advance-amount)
      )
    )
  )
)

(define-public (submit-milestone (invoice-id uint) (milestone-id uint) (proof-hash (buff 32)))
  (let (
      (invoice (try! (get-existing-invoice invoice-id)))
      (milestone (try! (get-existing-milestone invoice-id milestone-id)))
    )
    (begin
      (try! (assert-merchant invoice-id))
      (asserts! (is-eq (get state milestone) milestone-funded) err-invalid-milestone-state)
      (asserts!
        (is-eq (get status invoice) invoice-active)
        err-invalid-state
      )
      (map-set milestones
        { invoice-id: invoice-id, milestone-id: milestone-id }
        (merge milestone
          {
            proof-hash: (some proof-hash),
            state: milestone-completion-submitted
          }
        )
      )
      (ok true)
    )
  )
)

(define-public (approve-milestone (invoice-id uint) (milestone-id uint))
  (let (
      (invoice (try! (get-existing-invoice invoice-id)))
      (milestone (try! (get-existing-milestone invoice-id milestone-id)))
    )
    (begin
      (try! (assert-client invoice-id))
      (asserts!
        (is-eq (get status invoice) invoice-active)
        err-invalid-state
      )
      (asserts! (is-eq (get state milestone) milestone-completion-submitted) err-invalid-milestone-state)
      (map-set milestones
        { invoice-id: invoice-id, milestone-id: milestone-id }
        (merge milestone { state: milestone-approved })
      )
      (ok true)
    )
  )
)

(define-public (settle-milestone (invoice-id uint) (milestone-id uint))
  (let (
      (invoice (try! (get-existing-invoice invoice-id)))
      (milestone (try! (get-existing-milestone invoice-id milestone-id)))
      (lp (unwrap! (get lp invoice) err-not-lp-funded))
      (approved-repayment
        (+
          (approved-unsettled-repayment-at invoice-id u0 (get milestone-count invoice))
          (+ (approved-unsettled-repayment-at invoice-id u1 (get milestone-count invoice))
            (+ (approved-unsettled-repayment-at invoice-id u2 (get milestone-count invoice))
              (+ (approved-unsettled-repayment-at invoice-id u3 (get milestone-count invoice))
                (+ (approved-unsettled-repayment-at invoice-id u4 (get milestone-count invoice))
                  (+ (approved-unsettled-repayment-at invoice-id u5 (get milestone-count invoice))
                    (+ (approved-unsettled-repayment-at invoice-id u6 (get milestone-count invoice))
                      (+ (approved-unsettled-repayment-at invoice-id u7 (get milestone-count invoice))
                        (+ (approved-unsettled-repayment-at invoice-id u8 (get milestone-count invoice))
                          (+ (approved-unsettled-repayment-at invoice-id u9 (get milestone-count invoice))
                            (+ (approved-unsettled-repayment-at invoice-id u10 (get milestone-count invoice))
                              (+ (approved-unsettled-repayment-at invoice-id u11 (get milestone-count invoice))
                                (+ (approved-unsettled-repayment-at invoice-id u12 (get milestone-count invoice))
                                  (+ (approved-unsettled-repayment-at invoice-id u13 (get milestone-count invoice))
                                    (+ (approved-unsettled-repayment-at invoice-id u14 (get milestone-count invoice))
                                      (+ (approved-unsettled-repayment-at invoice-id u15 (get milestone-count invoice))
                                        (+ (approved-unsettled-repayment-at invoice-id u16 (get milestone-count invoice))
                                          (+ (approved-unsettled-repayment-at invoice-id u17 (get milestone-count invoice))
                                            (+ (approved-unsettled-repayment-at invoice-id u18 (get milestone-count invoice))
                                              (approved-unsettled-repayment-at invoice-id u19 (get milestone-count invoice))
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
      (has-unapproved
        (or
          (milestone-needs-dispute-at invoice-id u0 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u1 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u2 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u3 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u4 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u5 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u6 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u7 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u8 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u9 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u10 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u11 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u12 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u13 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u14 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u15 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u16 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u17 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u18 (get milestone-count invoice))
          (milestone-needs-dispute-at invoice-id u19 (get milestone-count invoice))
        )
      )
    )
    (begin
      (try! (assert-lp invoice-id))
      (asserts!
        (or
          (is-eq (get status invoice) invoice-funded-by-lp)
          (is-eq (get status invoice) invoice-active)
        )
        err-invalid-state
      )
      milestone
      ;; MVP: maturity height is informational only - settlement allowed anytime
      (if (> approved-repayment u0)
        (try! (transfer-sbtc approved-repayment contract-self lp))
        true
      )
      (try! (settle-approved-milestone-at invoice-id u0 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u1 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u2 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u3 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u4 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u5 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u6 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u7 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u8 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u9 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u10 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u11 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u12 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u13 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u14 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u15 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u16 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u17 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u18 (get milestone-count invoice)))
      (try! (settle-approved-milestone-at invoice-id u19 (get milestone-count invoice)))
      (if has-unapproved
        (begin
          (try! (dispute-unapproved-milestone-at invoice-id u0 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u1 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u2 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u3 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u4 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u5 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u6 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u7 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u8 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u9 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u10 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u11 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u12 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u13 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u14 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u15 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u16 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u17 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u18 (get milestone-count invoice)))
          (try! (dispute-unapproved-milestone-at invoice-id u19 (get milestone-count invoice)))
          true
        )
        true
      )
      (map-set invoices invoice-id
        (merge invoice
          {
            total-settled: (+ (get total-settled invoice) approved-repayment),
            status: (if has-unapproved invoice-dispute invoice-active)
          }
        )
      )
      (ok approved-repayment)
    )
  )
)

(define-public (open-dispute (invoice-id uint) (milestone-id uint))
  (let (
      (invoice (try! (get-existing-invoice invoice-id)))
      (milestone (try! (get-existing-milestone invoice-id milestone-id)))
    )
    (begin
      (try! (assert-party invoice-id))
      (asserts!
        (or
          (is-eq (get status invoice) invoice-escrow-funded)
          (is-eq (get status invoice) invoice-funded-by-lp)
          (is-eq (get status invoice) invoice-active)
        )
        err-invalid-state
      )
      (asserts!
        (or
          (is-eq (get state milestone) milestone-funded)
          (is-eq (get state milestone) milestone-completion-submitted)
        )
        err-invalid-milestone-state
      )
      ;; MVP: due block height is informational only - disputes allowed anytime
      (map-set milestones
        { invoice-id: invoice-id, milestone-id: milestone-id }
        (merge milestone { state: milestone-disputed })
      )
      (map-set invoices invoice-id
        (merge invoice { status: invoice-dispute })
      )
      (ok true)
    )
  )
)

(define-public (cancel-invoice (invoice-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (try! (assert-party invoice-id))
      (asserts!
        (not
          (or
            (is-eq (get status invoice) invoice-completed)
            (is-eq (get status invoice) invoice-cancelled)
          )
        )
        err-invalid-state
      )
      (try! (cancel-open-milestone-at invoice-id u0 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u1 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u2 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u3 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u4 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u5 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u6 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u7 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u8 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u9 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u10 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u11 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u12 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u13 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u14 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u15 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u16 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u17 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u18 (get milestone-count invoice)))
      (try! (cancel-open-milestone-at invoice-id u19 (get milestone-count invoice)))
      (map-set invoices invoice-id
        (merge invoice { status: invoice-cancelled })
      )
      (ok true)
    )
  )
)

(define-public (refund-leftover (invoice-id uint))
  (let (
      (invoice (try! (get-existing-invoice invoice-id)))
      (available (- (- (get total-escrowed invoice) (get total-settled invoice)) (get total-refunded invoice)))
    )
    (begin
      (try! (assert-client invoice-id))
      (asserts!
        (or
          (is-eq (get status invoice) invoice-completed)
          (is-eq (get status invoice) invoice-cancelled)
        )
        err-invalid-state
      )
      (asserts! (> available u0) err-no-leftover)
      (try! (transfer-sbtc available contract-self tx-sender))
      (map-set invoices invoice-id
        (merge invoice { total-refunded: (+ (get total-refunded invoice) available) })
      )
      (ok available)
    )
  )
)

(define-public (close-invoice (invoice-id uint))
  (let ((invoice (try! (get-existing-invoice invoice-id))))
    (begin
      (try! (assert-party invoice-id))
      (asserts!
        (and
          (milestone-resolved-at invoice-id u0 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u1 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u2 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u3 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u4 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u5 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u6 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u7 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u8 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u9 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u10 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u11 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u12 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u13 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u14 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u15 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u16 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u17 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u18 (get milestone-count invoice))
          (milestone-resolved-at invoice-id u19 (get milestone-count invoice))
        )
        err-close-blocked
      )
      (map-set invoices invoice-id
        (merge invoice
          {
            status:
              (if (is-eq (get total-settled invoice) (get face-value invoice))
                invoice-completed
                invoice-cancelled
              )
          }
        )
      )
      (ok true)
    )
  )
)
