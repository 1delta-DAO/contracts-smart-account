import { ethers } from "hardhat";
import { ModuleConfigAction, getContractSelectors, getSelectors } from "../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAccountAddresses, marginSwapAddresses, uniswapAddresses } from "../../deploy/00_addresses";
import { validateAddresses } from "../../utils/types";
import { delay } from "../03_various.";

async function main() {
    let tx
    let receipt
    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    // address parameters
    const wethAddress = (generalAddresses.WETH as any)[chainId]
    const uniswapFactoryAddress = (uniswapAddresses.factory as any)[chainId]
    const minimalRouterAddress = (marginSwapAddresses.minimalRouter as any)[chainId]
    const moduleManagerAddress = (marginSwapAccountAddresses.moduleManager as any)[chainId]
    validateAddresses([wethAddress, uniswapFactoryAddress, minimalRouterAddress, moduleManagerAddress])

    console.log("Deploy Module Manager on", chainId, "by", operator.address)

    // get Diamond
    const moduleConfig = await ethers.getContractAt('OneDeltaModuleManager', moduleManagerAddress)
    console.log('Module Manager gotten:', moduleConfig.address)


    // deploy modules
    console.log('')
    console.log('Deploying modules')

    // const tokenManagerModuleFactory = await ethers.getContractFactory('TokenManagerModule')
    // const tokenManagerModule = await tokenManagerModuleFactory.deploy()
    // await tokenManagerModule.deployed()
    // console.log("TokenManagerModule", tokenManagerModule.address)
    // await delay(10000)

    // const adminModuleFactory = await ethers.getContractFactory('AdminModule')
    // const adminModule = await adminModuleFactory.deploy()
    // await adminModule.deployed()
    // console.log("meta Market", adminModule.address)
    // await delay(10000)

    // const moneyMarketModuleFactory = await ethers.getContractFactory('MoneyMarketModulePolygon')
    // const moneyMarketModule = await moneyMarketModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    // await moneyMarketModule.deployed()
    // console.log("Money Market", moneyMarketModule.address)
    // await delay(10000)

    const uniswapCallbackModuleFactory = await ethers.getContractFactory('UniswapCallbackModulePolygon')
    const uniswapCallbackModule = await uniswapCallbackModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await uniswapCallbackModule.deployed()
    console.log("Uniswap Callback", uniswapCallbackModule.address)
    await delay(10000)

    // ======== Remove Old Module ========
    // let oldInit = await ethers.getContractAt(
    //     MoneyMarketModuleAbiOld,
    //     ((marginSwapAccountAddresses.MoneyMarket as any)[chainId] as any)[chainId],
    //     operator
    // )

    // const cutOld: {
    //     moduleAddress: string,
    //     action: any,
    //     functionSelectors: any[]
    // }[] = [{
    //     moduleAddress: ethers.constants.AddressZero,
    //     action: ModuleConfigAction.Remove,
    //     functionSelectors: getContractSelectors(oldInit)
    // }]

    // console.log("Attempt module adjustment for removal")
    // let tx
    // let receipt
    // tx = await moduleConfig.configureModules(cutOld)
    // console.log('Module adjustment tx: ', tx.hash)
    // receipt = await tx.wait()
    // if (!receipt.status) {
    //     throw Error(`Diamond removal failed: ${tx.hash}`)
    // } else {
    //     console.log('Completed module adjustment')
    //     console.log("Removal done")
    // }
    // await delay(10000)

    // // upgrade diamond with modules
    // console.log('')
    // console.log('Module Adjustments for adding')


    const cut: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = []

    const modules = [
        // tokenManagerModule,
        // adminModule,
        uniswapCallbackModule
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
