import { ethers } from "hardhat";
import { ModuleConfigAction, getContractSelectors, getSelectors } from "../../test/diamond/libraries/diamond"
import { marginSwapAccountAddresses } from "../../deploy/00_addresses"
import AccountInitAbi from "../../deployedModules/goerli/account-based/AccountInit.json"
import { delay } from "../03_various.";
// npx hardhat run scripts/goerli/account-based/replaceInitializers.ts --network goerli

async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Cut Diamond on", chainId, "by", operator.address)

    // get Module Manager
    const ModuleManagerFactory = await ethers.getContractFactory('OneDeltaModuleManager')
    const moduleManager = await ModuleManagerFactory.attach((marginSwapAccountAddresses.moduleManager as any)[chainId])
    const moduleConfig = await ethers.getContractAt('OneDeltaModuleManager', moduleManager.address)
    console.log('Module Manager gotten:', moduleManager.address)

    // ======== Remove Old Module ========
    let oldInit = await ethers.getContractAt(
        AccountInitAbi,
        (marginSwapAccountAddresses.accountInit as any)[chainId],
        operator
    )
    const oldModules = [oldInit]

    const cutOld: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = []

    // remove old module
    console.log("remove old modules")
    for (const module of oldModules) {
        cutOld.push({
            moduleAddress: ethers.constants.AddressZero,
            action: ModuleConfigAction.Remove,
            functionSelectors: getContractSelectors(module)
        })
    }

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

    // deploy modules
    console.log('')
    console.log('Deploying AccountInit module')

    const accountInitFactory = await ethers.getContractFactory('AccountInit')
    const accountInit = await accountInitFactory.deploy()
    await accountInit.deployed()
    console.log("AccountInit", accountInit.address)
    await delay(10000)

    // ======== Add New Module ========
    const cut: {
        moduleAddress: string,
        action: any,
        functionSelectors: any[]
    }[] = []

    const modules = [
        accountInit
    ]

    for (const module of modules) {
        cut.push({
            moduleAddress: module.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(module)
        })
    }

    // upgrade diamond with modules
    console.log('')
    console.log('Module Adjustment')
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

    // AccountInit 0x008F601Cd9F106cef0CF4c10D1c171C90Bf29C1f