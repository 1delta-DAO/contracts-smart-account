import '@nomiclabs/hardhat-ethers'
import hre from 'hardhat'
import { ModuleConfigAction, getSelectors } from "../../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAccountAddresses, marginSwapAddresses, uniswapAddresses } from "../../00_addresses";
import { validateAddresses } from '../../../utils/types';
import { delay } from '../utils/delay';

async function main() {

    const accounts = await hre.ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();


    // get module addresses
    const delegatorAddress = marginSwapAccountAddresses.delegator[chainId]
    const accountInitAddress = marginSwapAccountAddresses.accountInit[chainId]
    const marginTraderAddress = marginSwapAccountAddresses.marginTrader[chainId]
    const moneyMarketAddress = marginSwapAccountAddresses.moneyMarket[chainId]
    const metaAddress = marginSwapAccountAddresses.admin[chainId]
    const uniswapCallbackAddress = marginSwapAccountAddresses.uniswapCallback[chainId]
    const tokenManagerAddress = marginSwapAccountAddresses.tokenManager[chainId]


    validateAddresses([delegatorAddress, accountInitAddress, marginTraderAddress, moneyMarketAddress, metaAddress, uniswapCallbackAddress, tokenManagerAddress])

    console.log("Deploy Module Manager on", chainId, "by", operator.address)

    // deploy Module Manager
    // const Diamond = await hre.ethers.getContractFactory('OneDeltaModuleManager')
    // const moduleManager = await Diamond.deploy()
    // await moduleManager.deployed()
    const moduleManager = await hre.ethers.getContractAt('OneDeltaModuleManager', '0x108a3fa74ac2448b9a2007aef60fafc51f242a5d')
    console.log('Module Manager obtained:', moduleManager.address)
    await delay(7500)

    // deploy modules
    console.log('')
    console.log('Getting modules')

    const delegatorModule = await hre.ethers.getContractAt('DelegatorModulePolygon', delegatorAddress)
    console.log("Delegator", delegatorModule.address)
    await delay(500)

    const accountInitModule = await hre.ethers.getContractAt('AccountInit', accountInitAddress)
    console.log("Account Init", accountInitModule.address)
    await delay(500)

    const marginTraderModule = await hre.ethers.getContractAt('MarginTraderModulePolygon', marginTraderAddress)
    console.log("Margin Trader", marginTraderModule.address)
    await delay(500)

    const moneyMarketModule = await hre.ethers.getContractAt('MoneyMarketModulePolygon', moneyMarketAddress)
    console.log("Money Market", moneyMarketModule.address)
    await delay(500)

    const uniswapCallbackModule = await hre.ethers.getContractAt('UniswapCallbackModulePolygon', uniswapCallbackAddress)
    console.log("Uniswap Callback", uniswapCallbackModule.address)
    await delay(500)

    const adminModule = await hre.ethers.getContractAt('AdminModule', metaAddress)
    console.log("Admin Module", adminModule.address)
    await delay(500)

    const tokenManagerModule = await hre.ethers.getContractAt('TokenManagerModule', tokenManagerAddress)
    console.log("TokenManagerModule", tokenManagerModule.address)
    await delay(500)

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

    // Module Manager deployed: 0xeAddCf13E44a43184Df069122681e0a563AcdeEE

    // Deploying modules
    // Delegator 0xeeB5A6c0BEF5a018e627878197777E3d64bfA010
    // Account Init 0x427F927524174c436e52A6cF67DB33AB4260BDc8
    // Margin Trader 0x3e3A57c469B89504Aa7a1D261519755c7290301b
    // Money Market 0x8e663e0c83586287D0DEd24b6fd79E21868847CD
    // Uniswap Callback 0xD6e02bbfD2721A9Acd3a4Fc0989961D5acc7a63e
    // Admin Module 0xcB0A2Ab79E857BF3e85D6B17c5e2b2A9a5b1Eb0C
    // TokenManagerModule 0xC816CF8082172c3a2Ff19C5277f4c0658E660f08



