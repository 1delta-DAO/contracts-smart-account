import { ethers } from "hardhat";
import { ModuleConfigAction, getContractSelectors, getSelectors } from "../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAddresses, uniswapAddresses, marginSwapAccountAddresses } from "../../deploy/00_addresses"
import { validateAddresses } from "../../utils/types";
import { delay } from "../03_various.";
import { TokenManagerModule__factory } from "../../types";

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
    console.log('Deploying contracts')

    const tokenManagerModule = await new TokenManagerModule__factory(operator).deploy()
    await tokenManagerModule.deployed()

    console.log("tokenManager", tokenManagerModule.address)
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
        tokenManagerModule
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

    // Deploy Module Manager on 5 by 0x10E38dFfFCfdBaaf590D5A9958B01C9cfcF6A63B
    // Module Manager gotten: 0xA1648E8Fb1aBA314bA053ee1dBE025448E0c52e1
    
    // Deploying money market module
    // Margin Trader 0x29EbB93c460fA261B322A11b8Fd0215424eD52Fb
    // Money Market 0x06E1C32e300Adf3Ca9ab17E669ea1f414a55AE87
    // Uniswap Callback 0x4a3aB76F1f5E913dB468FA1eEbA88E1969bd439F
    // Sweeper 0x94b6be4faEA62cB4058E3B737C67aC98A7B6Fbde
    
    
    
    
