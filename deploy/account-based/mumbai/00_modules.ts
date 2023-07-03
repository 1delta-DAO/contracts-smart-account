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

    // deploy modules
    console.log('')
    console.log('Deploying modules')

    const delegatorModuleFactory = await hre.ethers.getContractFactory('DelegatorModule')
    const delegatorModule = await delegatorModuleFactory.deploy()
    await delegatorModule.deployed()
    console.log("Delegator", delegatorModule.address)
    await delay(5000)

    const accountInitModuleFactory = await hre.ethers.getContractFactory('AccountInit')
    const accountInitModule = await accountInitModuleFactory.deploy()
    await accountInitModule.deployed()
    console.log("Account Init", accountInitModule.address)
    await delay(5000)

    const marginTraderModuleFactory = await hre.ethers.getContractFactory('MarginTraderModule')
    const marginTraderModule = await marginTraderModuleFactory.deploy(uniswapFactoryAddress, wethAddress)
    await marginTraderModule.deployed()
    console.log("Margin Trader", marginTraderModule.address)
    await delay(5000)

    const moneyMarketModuleFactory = await hre.ethers.getContractFactory('MoneyMarketModuleMumbai')
    const moneyMarketModule = await moneyMarketModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await moneyMarketModule.deployed()
    console.log("Money Market", moneyMarketModule.address)
    await delay(5000)

    const uniswapCallbackModuleFactory = await hre.ethers.getContractFactory('UniswapCallbackModuleMumbai')
    const uniswapCallbackModule = await uniswapCallbackModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await uniswapCallbackModule.deployed()
    console.log("Uniswap Callback", uniswapCallbackModule.address)
    await delay(5000)

    const sweeperModuleFactory = await hre.ethers.getContractFactory('SweeperModuleMumbai')
    const sweeperModule = await sweeperModuleFactory.deploy(uniswapFactoryAddress, wethAddress, minimalRouterAddress)
    await sweeperModule.deployed()
    console.log("Sweeper", sweeperModule.address)
    await delay(5000)

    const adminModuleFactory = await hre.ethers.getContractFactory('AdminModule')
    const adminModule = await adminModuleFactory.deploy()
    await adminModule.deployed()
    console.log("Admin Module", adminModule.address)
    await delay(5000)

    const tokenManagerModuleFactory = await hre.ethers.getContractFactory('TokenManagerModule')
    const tokenManagerModule = await tokenManagerModuleFactory.deploy()
    await tokenManagerModule.deployed()
    console.log("TokenManagerModule", tokenManagerModule.address)
    await delay(5000)

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
        tokenManagerModule,
        sweeperModule
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

    // Deploy Module Manager on 80001 by 0x4d6f46Ff41908A0920986aab432ab4A98E5Cbdeb
    // Module Manager deployed: 0x2E5134f3Af641C8A9B8B0893023a19d47699ECD1
    
    // Deploying modules
    // Delegator 0x9a11804262cCdACdD9cb1cF69F243F38e81Cb36A
    // Account Init 0x84362c9055BC35d970f32727F82332170f7d062f
    // Margin Trader 0xEd61752b468f45ca7eB60DF2A9A50A015451a9F9
    // Money Market 0xa1ac22F1c89B6859737977ECce046A48c202383f
    // Uniswap Callback 0x74DfB594E064221573b6273110cf25B6b4792dc4
    // Sweeper 0x67E16f350a4E0Dc67bf5981b1c18015FA4C247ec
    // Admin Module 0xc447b7e5eD021862498102A0abe46814d5155BF9
    // TokenManagerModule 0xdd2AC61f37Ae46D0D9c74E1e9ac4C3Bb23F7c572
    

