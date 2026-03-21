import { readFileSync } from 'fs'
import { generateWallet } from '@stacks/wallet-sdk'
import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from '@stacks/transactions'
import { StacksTestnet } from '@stacks/network'

const MNEMONIC = 'barrel film narrow gym jealous call soul patient wedding key turn wine anchor else license steel top balance come bounce miss bone actress trouble'
const CONTRACT_NAME = 'invoicebtc-v4'
const CONTRACT_PATH = '../contracts/invoicebtc.clar'

const network = new StacksTestnet({ url: 'https://api.testnet.hiro.so' })

const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' })
const account = wallet.accounts[0]
const privateKey = account.stxPrivateKey

const codeBody = readFileSync(CONTRACT_PATH, 'utf8')

console.log(`Deploying ${CONTRACT_NAME} from ${account.address}...`)

const tx = await makeContractDeploy({
  contractName: CONTRACT_NAME,
  codeBody,
  senderKey: privateKey,
  network,
  anchorMode: AnchorMode.OnChainOnly,
  postConditionMode: PostConditionMode.Allow,
  fee: 400000n,
})

const result = await broadcastTransaction({ transaction: tx, network })
console.log('Broadcast result:', JSON.stringify(result, null, 2))

if (result.txid) {
  console.log(`\nSuccess! TX: https://explorer.hiro.so/txid/${result.txid}?chain=testnet`)
} else {
  console.error('\nBroadcast failed:', result)
}
