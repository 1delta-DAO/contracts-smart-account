import { ethers } from "hardhat";
import { ModuleConfigAction } from "../../test/diamond/libraries/diamond"
import { marginSwapAddresses, marginSwapAccountAddresses } from "../../deploy/00_addresses"
import { validateAddresses } from "../../utils/types";

// npx hardhat run scripts/polygon/account-based/removeTradeContracts.ts --network matic

//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Select Diamond Manager on", chainId, "by", operator.address)

    // const oldMods = '0xeAddCf13E44a43184Df069122681e0a563AcdeEE';
    const moduleManagerAddress =  (marginSwapAccountAddresses.moduleManager as any)[chainId]

    const marginTraderAddress = (marginSwapAccountAddresses.marginTrader as any)[chainId]
    const uniswapCallbackAddress = (marginSwapAccountAddresses.uniswapCallback as any)[chainId]
    const meta = (marginSwapAccountAddresses.admin as any)[chainId]
    const moneyMarketAddress = (marginSwapAccountAddresses.moneyMarket as any)[chainId]
    const sweeperAddress = (marginSwapAccountAddresses.sweeper as any)[chainId]
    const tokenManagerAddress = (marginSwapAccountAddresses.tokenManager as any)[chainId]

    validateAddresses([moduleManagerAddress, marginSwapAddresses, uniswapCallbackAddress, tokenManagerAddress, meta, moneyMarketAddress])
    // get Diamond
    const Diamond = await ethers.getContractFactory('OneDeltaModuleManager')

    const moduleManager = await Diamond.attach(moduleManagerAddress)

    console.log('Module Manager gotten:', moduleManager.address)

    // fetch manager
    console.log('')
    console.log('Manager')

    const moduleConfig = await ethers.getContractAt('OneDeltaModuleManager', moduleManager.address)
    let tx
    let receipt

    const cut: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = []


    const selectorsTokenManager = await moduleConfig.moduleFunctionSelectors(tokenManagerAddress)
    // const selectorsMeta = await moduleConfig.moduleFunctionSelectors(adminModule.address)
    const selectorsMarginTrader = await moduleConfig.moduleFunctionSelectors(marginTraderAddress)
    const selectorsCallback = await moduleConfig.moduleFunctionSelectors(uniswapCallbackAddress)
    const selectorsMoneyMarket = await moduleConfig.moduleFunctionSelectors(moneyMarketAddress)
    const selectorsSweeper = await moduleConfig.moduleFunctionSelectors(sweeperAddress)

    // uniswapCallbackModule
    const moduleSelectors = [
        selectorsTokenManager,
        // selectorsMeta
        // selectorsSweeper,
        // selectorsMoneyMarket,
        // selectorsCallback,
        // selectorsMarginTrader
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
