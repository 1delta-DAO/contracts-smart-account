import '@nomiclabs/hardhat-ethers'
import hre from 'hardhat'
import { ModuleConfigAction, getSelectors } from "../../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAddresses, uniswapAddresses } from "../../00_addresses";
import { validateAddresses } from '../../../utils/types';
import { delay } from '../utils/delay';

async function main() {

    const accounts = await hre.ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    // address parameters
    const wethAddress = generalAddresses.WETH[chainId]
    const uniswapFactoryAddress = uniswapAddresses.factory[chainId]
    const minimalRouterAddress = marginSwapAddresses.minimalRouter[chainId]

    validateAddresses([wethAddress, uniswapFactoryAddress, minimalRouterAddress])

    console.log("Deploy Module Manager on", chainId, "by", operator.address)

    // deploy Module Manager
    const Diamond = await hre.ethers.getContractFactory('OneDeltaModuleManager')
    const moduleManager = await Diamond.deploy()
    await moduleManager.deployed()
    console.log('Module Manager deployed:', moduleManager.address)
    await delay(7500)

    // deploy modules
    console.log('')
    console.log('Deploying modules')

    const delegatorModuleFactory = await hre.ethers.getContractFactory('DelegatorModule')
    const delegatorModule = await delegatorModuleFactory.deploy()
    await delegatorModule.deployed()
    console.log("Delegator", delegatorModule.address)
    await delay(7500)

    const accountInitModuleFactory = await hre.ethers.getContractFactory('AccountInit')
    const accountInitModule = await accountInitModuleFactory.deploy()
    await accountInitModule.deployed()
    console.log("Account Init", accountInitModule.address)
    await delay(7500)

    const marginTraderModuleFactory = await hre.ethers.getContractFactory('MarginTraderModule')
    const marginTraderModule = await marginTraderModuleFactory.deploy(uniswapFactoryAddress, wethAddress)
    await marginTraderModule.deployed()
    console.log("Margin Trader", marginTraderModule.address)
    await delay(7500)

    const moneyMarketModuleFactory = await hre.ethers.getContractFactory('MoneyMarketModuleGoerli')
    const moneyMarketModule = await moneyMarketModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await moneyMarketModule.deployed()
    console.log("Money Market", moneyMarketModule.address)
    await delay(7500)

    const uniswapCallbackModuleFactory = await hre.ethers.getContractFactory('UniswapCallbackModuleGoerli')
    const uniswapCallbackModule = await uniswapCallbackModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await uniswapCallbackModule.deployed()
    console.log("Uniswap Callback", uniswapCallbackModule.address)
    await delay(7500)

    const adminModuleFactory = await hre.ethers.getContractFactory('AdminModule')
    const adminModule = await adminModuleFactory.deploy()
    await adminModule.deployed()
    console.log("Admin Module", adminModule.address)
    await delay(7500)

    const tokenManagerModuleFactory = await hre.ethers.getContractFactory('TokenManagerModule')
    const tokenManagerModule = await tokenManagerModuleFactory.deploy()
    await tokenManagerModule.deployed()
    console.log("TokenManagerModule", tokenManagerModule.address)
    await delay(7500)

    // upgrade diamond with modules
    console.log('')
    console.log('Module Adjustments')

    // console.log(cut.map(x => x.functionSelectors.map(y => abiDecoder.decodeMethod(y))))
    const moduleConfig = await hre.ethers.getContractAt('OneDeltaModuleManager', moduleManager.address)
    let tx
    let receipt

    const cut: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = []

    const modules = [
        delegatorModule,
        accountInitModule,
        marginTraderModule,
        moneyMarketModule,
        uniswapCallbackModule,
        adminModule,
        tokenManagerModule
    ]

    for (const module of modules) {
        cut.push({
            moduleAddress: module.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(module)
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

    // Module Manager deployed: 0xA1648E8Fb1aBA314bA053ee1dBE025448E0c52e1

    // Deploying modules
    // Delegator 0x07aa9242097FFE0Da685a6448dfa7B7830C6929A
    // Account Init 0x525d646eCf5202cC604c88b17D49e55eb802DF86
    // Margin Trader 0xE817Fea2febC07001280750f9b6d78aDA0Bb6398
    // Money Market 0xb3E75A42a19D35874d68B3c6E8Fac6917b652da1
    // Uniswap Callback 0x92EA5a85FE84980BEA075A4d4927caE0EacC2E23
    // Admin Module 0x6CE3C84fBb0C6138516425eAeD60e5804315D99d
    // TokenManagerModule 0x362FdA0586E66A06e263db3EDCA917cEBD3e921E
    

