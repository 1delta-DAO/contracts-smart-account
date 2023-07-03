import { ethers } from "hardhat";
import { ModuleConfigAction, getContractSelectors } from "../../test/diamond/libraries/diamond"
import { marginSwapAccountAddresses } from "../../deploy/00_addresses"
import MarginTraderAbi from "../../artifacts/contracts/1delta/modules/MarginTraderModule.sol/MarginTraderModule.json"
import MarginTraderModulePolygon from "../../artifacts/contracts/1delta/modules/MarginTraderModule.sol/MarginTraderModule.json"
import UniswapCallback from "../../artifacts/contracts/1delta/modules/polygon/UniswapCallbackModule.sol/UniswapCallbackModulePolygon.json"
import UniCallbackAbi from "../../artifacts/contracts/1delta/modules/polygon/UniswapCallbackModule.sol/UniswapCallbackModulePolygon.json"
import SweeperArtifact from "../../artifacts/contracts/1delta/modules/polygon/SweeperModule.sol/SweeperModulePolygon.json"
import MoneyMarketArtifact from "../../artifacts/contracts/1delta/modules/polygon/MoneyMarketModule.sol/MoneyMarketModulePolygon.json"
import AdminModule from "../../artifacts/contracts/1delta/modules/AdminModule.sol/AdminModule.json"
import TokenManagerModule from "../../artifacts/contracts/1delta/modules/TokenManagerModule.sol/TokenManagerModule.json"
// npx hardhat run scripts/goerli/replaceMoneyMarket.ts --network goerli


//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    // const oldMods = '0xeAddCf13E44a43184Df069122681e0a563AcdeEE';
    const managerAddress = (marginSwapAccountAddresses.moduleManager as any)[chainId]
    console.log("Deploy Module Manager on", chainId, "by", operator.address)
    // deploy Module Manager
    const Diamond = await ethers.getContractFactory('OneDeltaModuleManager')

    const marginTraderAddress = (marginSwapAccountAddresses.marginTrader as any)[chainId]
    const moneyMarketAddress = (marginSwapAccountAddresses.moneyMarket as any)[chainId]
    const callbackAddress = (marginSwapAccountAddresses.uniswapCallback as any)[chainId]
    const sweeperAddress = (marginSwapAccountAddresses.sweeper as any)[chainId]
    const metaAddress = (marginSwapAccountAddresses.admin as any)[chainId]
    const tokenManagerAddress = (marginSwapAccountAddresses.tokenManager as any)[chainId]

    const moduleManager = await Diamond.attach(managerAddress)

    console.log('Module Manager gotten:', moduleManager.address)


    // deploy modules
    console.log('')
    console.log('Deploying money market module')


    const marginTraderModule = await ethers.getContractAt(
        MarginTraderModulePolygon.abi,
        marginTraderAddress,
        operator
    )

    const moneyMarketModule = await ethers.getContractAt(
        MoneyMarketArtifact.abi,
        moneyMarketAddress,
        operator
    )


    const callbackModule = await ethers.getContractAt(
        UniswapCallback.abi,
        callbackAddress,
        operator
    )

    const sweeperModule = await ethers.getContractAt(
        SweeperArtifact.abi,
        sweeperAddress,
        operator
    )

    // const adminModule = await ethers.getContractAt(
    //     AdminModule.abi,
    //     metaAddress,
    //     operator
    // )

    // const tokenManagerModule = await ethers.getContractAt(
    //     TokenManagerModule.abi,
    //     tokenManagerAddress,
    //     operator
    // )



    // upgrade diamond with modules
    console.log('')
    console.log('Add modules')
    const selectorsMoneyMarket = getContractSelectors(moneyMarketModule) // await moduleManager.moduleFunctionSelectors(moneyMarketModule.address)
    const selectorsMarginTrader = getContractSelectors(marginTraderModule) // await moduleManager.moduleFunctionSelectors(moneyMarketModule.address)
    const selectorsCallback = getContractSelectors(callbackModule) // await moduleManager.moduleFunctionSelectors(moneyMarketModule.address)
    const selectorsSweeper = getContractSelectors(sweeperModule)
    // const metaSelectors = getContractSelectors(adminModule)
    // const tokenManagerSelectors = getContractSelectors(tokenManagerModule)

    const moduleConfig = await ethers.getContractAt('OneDeltaModuleManager', moduleManager.address)
    let tx
    let receipt

    const cut: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = []


    const modules = [
        { address: moneyMarketModule.address, selectors: selectorsMoneyMarket },
        { address: marginTraderModule.address, selectors: selectorsMarginTrader },
        { address: callbackModule.address, selectors: selectorsCallback },
        { address: sweeperModule.address, selectors: selectorsSweeper },
        // { address: adminModule.address, selectors: metaSelectors },
        // { address: tokenManagerModule.address, selectors: tokenManagerSelectors }
    ]

    for (const module of modules) {
        cut.push({
            moduleAddress: module.address,
            action: ModuleConfigAction.Add,
            functionSelectors: module.selectors
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