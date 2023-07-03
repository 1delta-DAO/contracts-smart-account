import { ethers } from "hardhat";
import { ModuleConfigAction } from "../../test/diamond/libraries/diamond"
import { marginSwapAddresses, marginSwapAccountAddresses } from "../../deploy/00_addresses"
import { validateAddresses } from "../../utils/types";
// npx hardhat run scripts/goerli/account-based/replaceMoneyMarket.ts --network goerli

//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Select Diamond Manager on", chainId, "by", operator.address)

    // get Diamond
    const Diamond = await ethers.getContractFactory('OneDeltaModuleManager')

    const moduleManager = await Diamond.attach((marginSwapAccountAddresses.moduleManager as any)[chainId])

    console.log('Module Manager gotten:', moduleManager.address)


    const marginTraderAddress = (marginSwapAccountAddresses.marginTrader as any)[chainId]
    const callbackAddress = (marginSwapAccountAddresses.uniswapCallback as any)[chainId]
    const moneyMarketAddress = (marginSwapAccountAddresses.moneyMarket as any)[chainId]
    const sweeperAddress = (marginSwapAccountAddresses.sweeper as any)[chainId]
    const tokenManager = (marginSwapAccountAddresses.tokenManager as any)[chainId]
    const meta = (marginSwapAccountAddresses.admin as any)[chainId]
    const moduleManagerAddress = (marginSwapAccountAddresses.moduleManager as any)[chainId]

    validateAddresses([moduleManagerAddress, marginSwapAddresses, callbackAddress, tokenManager, meta, moneyMarketAddress])
    // deploy modules
    console.log('')
    console.log('Getting modules')

    // upgrade diamond with modules
    console.log('')
    console.log('Module Adjustment')

    const moduleConfig = await ethers.getContractAt('OneDeltaModuleManager', moduleManager.address)
    let tx
    let receipt

    const cut: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = []

    const selectorsMarginTrader = await moduleConfig.moduleFunctionSelectors(marginTraderAddress)
    const selectorsCallback = await moduleConfig.moduleFunctionSelectors(callbackAddress)
    const selectorsMoneyMarket = await moduleConfig.moduleFunctionSelectors(moneyMarketAddress)
    const selectorsSweeper = await moduleConfig.moduleFunctionSelectors(sweeperAddress)


    // uniswapCallbackModule
    const moduleSelectors = [
        // selectorsTokenManager,
        // selectorsMeta
        // selectorsSweeper,
        // selectorsMoneyMarket,
        // selectorsCallback,
        selectorsMarginTrader
    ]
    for (const selector of moduleSelectors) {
        cut.push({
            moduleAddress: ethers.constants.AddressZero,
            action: ModuleConfigAction.Remove,
            functionSelectors: selector.functionSelectors
        })
    }

    console.log("Attempt module adjustment: Remove", cut)
    tx = await moduleConfig.configureModules(cut)
    console.log('Module adjustment tx: ', tx.hash)
    receipt = await tx.wait()
    if (!receipt.status) {
        throw Error(`Module adjustment failed: ${tx.hash}`)
    } else {
        console.log('Completed module adjustment')
        console.log("Removal done")
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
