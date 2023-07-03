import { ethers } from "hardhat";
import { ModuleConfigAction, getContractSelectors, getSelectors } from "../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAccountAddresses, marginSwapAddresses, uniswapAddresses } from "../../deploy/00_addresses";
import MoneyMarketModuleAbiOld from "../../deployedModules/goerli/account-based/MoneyMarketModule.json"
import { delay } from "../03_various.";

async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    // address parameters
    const wethAddress = (generalAddresses.WETH as any)[chainId] || ethers.constants.AddressZero
    const uniswapFactoryAddress = (uniswapAddresses.factory as any)[chainId] || ethers.constants.AddressZero
    const minimalRouterAddress = marginSwapAddresses.minimalRouter || ethers.constants.AddressZero

    console.log("Deploy Module Manager on", chainId, "by", operator.address)

    // get Module Manager
    const ModuleManagerFactory = await ethers.getContractFactory('OneDeltaModuleManager')
    const moduleManager = await ModuleManagerFactory.attach((marginSwapAccountAddresses.moduleManager as any)[chainId])
    const moduleConfig = await ethers.getContractAt('OneDeltaModuleManager', moduleManager.address)
    console.log('Module Manager gotten:', moduleManager.address)


    // deploy modules
    console.log('')
    console.log('Deploying modules')

    const tokenManagerModuleFactory = await ethers.getContractFactory('TokenManagerModule')
    const tokenManagerModule = await tokenManagerModuleFactory.deploy()
    await tokenManagerModule.deployed()
    console.log("TokenManagerModule", tokenManagerModule.address)
    await delay(5000)

    const moneyMarketModuleFactory = await ethers.getContractFactory('MoneyMarketModuleGoerli')
    const moneyMarketModule = await moneyMarketModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await moneyMarketModule.deployed()
    console.log("Money Market", moneyMarketModule.address)
    await delay(5000)

    // ======== Remove Old Module ========
    let oldInit = await ethers.getContractAt(
        MoneyMarketModuleAbiOld,
        (marginSwapAccountAddresses.moneyMarket as any)[chainId],
        operator
    )

    const cutOld: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = [{
        moduleAddress: ethers.constants.AddressZero,
        action: ModuleConfigAction.Remove,
        functionSelectors: getContractSelectors(oldInit)
    }]

    console.log("Attempt module adjustment for removal")
    let tx
    let receipt
    tx = await moduleConfig.configureModules(cutOld)
    console.log('Module adjustment tx: ', tx.hash)
    receipt = await tx.wait()
    if (!receipt.status) {
        throw Error(`Diamond removal failed: ${tx.hash}`)
    } else {
        console.log('Completed module adjustment')
        console.log("Removal done")
    }
    await delay(10000)

    // upgrade diamond with modules
    console.log('')
    console.log('Module Adjustments for adding')


    const cut: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = []

    const modules = [
        tokenManagerModule,
        moneyMarketModule,
    ]

    for (const module of modules) {
        cut.push({
            moduleAddress: module.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getContractSelectors(module)
        })
    }

    console.log("Attempt module adjustment")
    tx = await moduleConfig.configureModules(cut)
    console.log('Module adjustment tx: ', tx.hash)
    receipt = await tx.wait()
    if (!receipt.status) {
        throw Error(`Module adjustment failed: ${tx.hash}`)
    }
    console.log('Completed module adjustment')
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

    // TokenManagerModule 0x6E125cA033eEB18A0de684341Dc113bEC4CaC38e
    // Money Market 0xdc62132379f4cf527Bf8901C20e367084dD247A4
    