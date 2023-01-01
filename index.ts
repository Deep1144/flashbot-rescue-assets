import { providers, Wallet, utils } from 'ethers'
import {
    FlashbotsBundleProvider,
    FlashbotsBundleResolution
} from '@flashbots/ethers-provider-bundle'
import { exit } from 'process'
require('dotenv').config()

const FLASHBOTS_URL = "https://relay-goerli.flashbots.net"

const { TOKENS, HACKED_WALLET, RESCUER } = process.env

if (!TOKENS || !HACKED_WALLET || !RESCUER) {
    throw new Error("Env's are missing");
}

const run = async () => {
    const provider = new providers.JsonRpcProvider('https://rpc.ankr.com/eth_goerli')

    const authSigner = Wallet.createRandom()

    const flashbotProvider = await FlashbotsBundleProvider.create(
        provider,
        authSigner,
        FLASHBOTS_URL
    )


    const rescuer = new Wallet(RESCUER).connect(provider)
    const hackedWallet = new Wallet(HACKED_WALLET).connect(provider)


    const abi = ["function transfer(address,uint256) external"]

    const iface = new utils.Interface(abi)

    provider.on('block', async (blockNo) => {
        console.log('block minted', blockNo, rescuer.address)
        const targetBlock = blockNo + 1;
        const resp = await flashbotProvider.sendBundle([
            {
                signer: rescuer,
                transaction: {
                    chainId: 5,
                    type: 2,
                    to: hackedWallet.address,
                    value: utils.parseEther('0.01'),
                    maxFeePerGas: utils.parseUnits('20', 'gwei'),
                    maxPriorityFeePerGas: utils.parseUnits('13', 'gwei')
                }
            },
            {
                signer: hackedWallet,
                transaction: {
                    chainId: 5,
                    type: 2,
                    to: TOKENS,
                    gasLimit: '70000',
                    data: iface.encodeFunctionData("transfer", [
                        rescuer.address,
                        utils.parseEther('200')
                    ]),
                    maxFeePerGas: utils.parseUnits('20', 'gwei'),
                    maxPriorityFeePerGas: utils.parseUnits('13', 'gwei')
                }
            }
        ], targetBlock)


        if ('error' in resp) {
            console.log((resp.error as any).message)
            return;
        }

        const response = await resp.wait()

        if (response === FlashbotsBundleResolution.BundleIncluded) {
            console.log('Included in block no:', targetBlock)
            exit(0)
        }
        else if (response === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
            console.log('Not included block no:', targetBlock)
        }
        else if (response === FlashbotsBundleResolution.AccountNonceTooHigh) {
            console.log('Nonce high')
            exit(1)
        }
    })
}

run()