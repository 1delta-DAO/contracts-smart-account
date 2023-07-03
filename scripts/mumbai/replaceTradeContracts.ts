import { ethers } from "hardhat";
import { ModuleConfigAction, getSelectors } from "../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAddresses, uniswapAddresses, marginSwapAccountAddresses } from "../../deploy/00_addresses"
import { delay } from "../03_various.";

// npx hardhat run scripts/goerli/account-based/replaceMoneyMarket.ts --network goerli

//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    // address parameters
    const wethAddress = (generalAddresses as any).WETH[chainId] || ethers.constants.AddressZero
    const uniswapFactoryAddress = (uniswapAddresses as any).factory[chainId] || ethers.constants.AddressZero
    const minimalRouterAddress = (marginSwapAddresses as any).minimalRouter || ethers.constants.AddressZero

    console.log("Deploy Module Manager on", chainId, "by", operator.address)

    // deploy Module Manager
    const ModuleManagerFactory = await ethers.getContractFactory('OneDeltaModuleManager')

    const moduleManager = await ModuleManagerFactory.attach((marginSwapAccountAddresses.moduleManager as any)[chainId])

    console.log('Module Manager gotten:', moduleManager.address)


    // deploy modules
    console.log('')
    console.log('Deploying money market module')

    const marginTraderModuleFactory = await ethers.getContractFactory('MarginTraderModuleGoerli')
    const marginTraderModule = await marginTraderModuleFactory.deploy(uniswapFactoryAddress, wethAddress)
    await marginTraderModule.deployed()
    console.log("Margin Trader", marginTraderModule.address)
    await delay(5000)

    const moneyMarketModuleFactory = await ethers.getContractFactory('MoneyMarketModuleGoerli')
    const moneyMarketModule = await moneyMarketModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await moneyMarketModule.deployed()
    console.log("Money Market", moneyMarketModule.address)
    await delay(5000)

    const uniswapCallbackModuleFactory = await ethers.getContractFactory('UniswapCallbackModuleGoerli')
    const uniswapCallbackModule = await uniswapCallbackModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await uniswapCallbackModule.deployed()
    console.log("Uniswap Callback", uniswapCallbackModule.address)
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
        uniswapCallbackModule
    ]

    for (const module of modules) {
        cut.push({
            moduleAddress: module.address,
            action: ModuleConfigAction.Replace,
            functionSelectors: getSelectors(module)
        })
    }

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

    // Margin Trader 0xfa7a7593b200BaE227948c2968fd2655fb56CBf1
    // Money Market 0x250F0D1da6a2211106927704A11423F55EfD4B4F
    // Uniswap Callback 0x6c5BaE88D2aE38a01bA291aBDA742F6EA5E9c86e
