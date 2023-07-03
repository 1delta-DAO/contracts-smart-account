import { ethers } from "hardhat";
import { ModuleConfigAction, getContractSelectors, getSelectors } from "../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAddresses, uniswapAddresses, marginSwapAccountAddresses } from "../../deploy/00_addresses"
import MarginTraderAbi from "../../deployedModules/goerli/account-based/MarginTradingModule.json"
import MoneyMarketAbi from "../../deployedModules/goerli/account-based/MoneyMarketModule.json"
import UniCallbackAbi from "../../deployedModules/goerli/account-based/UniswapCallbackModule.json"
// npx hardhat run scripts/goerli/account-based/replaceMoneyMarket.ts --network goerli

//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Deploy Module Manager on", chainId, "by", operator.address)

    // deploy Module Manager
    const ModuleManagerFactory = await ethers.getContractFactory('OneDeltaModuleManager')

    const moduleManager = await ModuleManagerFactory.attach((marginSwapAccountAddresses.moduleManager as any)[chainId])

    console.log('Module Manager gotten:', moduleManager.address)


    // deploy modules
    console.log('')
    console.log('Deploying money market module')


    const marginTraderModule = await ethers.getContractAt(
        MarginTraderAbi,
        "0xAad93F101123A3c20E55b215b726c9be5B4Be96F",
        operator
    )

    const moneyMarketModule = await ethers.getContractAt(
        MoneyMarketAbi,
        "0xf6B5865cd44BE65625C5a0212E5058ec294A5166",
        operator
    )

    const selectorsMarginTrader = getSelectors(marginTraderModule)
    const selectorMoneyMarket = getSelectors(moneyMarketModule)
    console.log("selectorsMoneyMarket", selectorMoneyMarket)
    console.log("selectorsMarginTrader", selectorsMarginTrader)

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


    const modules = [
        marginTraderModule
        // moneyMarketModule,
        // uniswapCallbackModule
    ]

    for (const module of modules) {
        cut.push({
            moduleAddress: module.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getContractSelectors(module)
        })
    }

    console.log("Cut:", cut)
    console.log("Attempt module adjustment")
    tx = await moduleConfig.configureModules(cut)
    console.log('Module adjustment tx: ', tx.hash)
    receipt = await tx.wait()
    if (!receipt.status) {
        throw Error(`Module adjustment failed: ${tx.hash}`)
    } else {
        console.log('Completed module adjustment')
        console.log("Upgrade done")
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

    // Deploying money market module
    // Margin Trader 0x7779D40368abD870e4e62539eF43a60Ed2BD3a47
    // Money Market 0x0ba84cef481AB8556bDf90a43d4c25fD63352f67
    // Uniswap Callback 0xBeFc8976d28756A401ef22004ECb66637fa9993E

