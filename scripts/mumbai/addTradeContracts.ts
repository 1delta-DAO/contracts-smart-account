import { ethers } from "hardhat";
import { ModuleConfigAction, getContractSelectors } from "../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAddresses, uniswapAddresses, marginSwapAccountAddresses } from "../../deploy/00_addresses"
import { delay } from "../03_various.";
import { validateAddresses } from "../../utils/types";

// npx hardhat run scripts/goerli/account-based/replaceMoneyMarket.ts --network goerli

//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    // address parameters
    const wethAddress = (generalAddresses as any).WETH[chainId] || ethers.constants.AddressZero
    const uniswapFactoryAddress = (uniswapAddresses as any).factory[chainId] || ethers.constants.AddressZero
    const minimalRouterAddress = (marginSwapAddresses as any).minimalRouter[chainId] || ethers.constants.AddressZero

    validateAddresses([wethAddress, uniswapFactoryAddress, minimalRouterAddress])

    console.log("Add trade contracts on", chainId, "by", operator.address)

    // deploy Module Manager
    const ModuleManagerFactory = await ethers.getContractFactory('OneDeltaModuleManager')

    const moduleManager = await ModuleManagerFactory.attach((marginSwapAccountAddresses.moduleManager as any)[chainId])

    console.log('Module Manager gotten:', moduleManager.address)


    // deploy modules
    console.log('')
    console.log('Deploying money market module')

    const marginTraderModuleFactory = await ethers.getContractFactory('MarginTraderModule')
    const marginTraderModule = await marginTraderModuleFactory.deploy(uniswapFactoryAddress)
    await marginTraderModule.deployed()
    console.log("Margin Trader", marginTraderModule.address)
    await delay(5000)

    const moneyMarketModuleFactory = await ethers.getContractFactory('MoneyMarketModuleMumbai')
    const moneyMarketModule = await moneyMarketModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await moneyMarketModule.deployed()
    console.log("Money Market", moneyMarketModule.address)
    await delay(5000)

    const uniswapCallbackModuleFactory = await ethers.getContractFactory('UniswapCallbackModuleMumbai')
    const uniswapCallbackModule = await uniswapCallbackModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await uniswapCallbackModule.deployed()
    console.log("Uniswap Callback", uniswapCallbackModule.address)
    await delay(5000)

    const sweeperModuleFactory = await ethers.getContractFactory('SweeperModuleMumbai')
    const sweeperModule = await sweeperModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await sweeperModule.deployed()
    console.log("Sweeper", sweeperModule.address)
    await delay(5000)


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
        marginTraderModule,
        moneyMarketModule,
        uniswapCallbackModule,
        sweeperModule
    ]

    for (const module of modules) {
        cut.push({
            moduleAddress: module.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getContractSelectors(module)
        })
    }
    console.log("Attempt module adjustment", cut)
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
    // Margin Trader 0xaF7b3C35D66B160439d70ef1AaeC2F936e852c3a
    // Money Market 0x3AA9A46184BE217d879f101552D83b8Ec5719B17
    // Uniswap Callback 0x1D0Ed18A3b012FBaB0901370cda330Cc6EDDfc4c
    // Sweeper 0x4529c3Ad767e2D251a15322AAfcF8581F2C6c122
    

