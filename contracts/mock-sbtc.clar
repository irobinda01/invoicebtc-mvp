;; Minimal sBTC-style SIP-010 helper for local testing.

(impl-trait .sip-010-trait.sip-010-trait)

(define-fungible-token sbtc)

(define-constant contract-owner tx-sender)
(define-constant err-not-authorized (err u100))
(define-constant err-transfer-failed (err u101))

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-not-authorized)
    (try! (ft-mint? sbtc amount recipient))
    (ok true)
  )
)

(define-public (transfer
  (amount uint)
  (sender principal)
  (recipient principal)
  (memo (optional (buff 34)))
)
  (let ((authorized (or (is-eq tx-sender sender) (is-eq contract-caller sender))))
    (begin
      (asserts! authorized err-not-authorized)
      memo
      (try! (ft-transfer? sbtc amount sender recipient))
      (ok true)
    )
  )
)

(define-read-only (get-balance (owner principal))
  (ok (ft-get-balance sbtc owner))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply sbtc))
)
