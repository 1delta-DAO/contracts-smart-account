import { ethers } from "hardhat";
import { marginSwapAccountAddresses } from "../../deploy/00_addresses";
import AccountFactoryProxyAbi from "../../deployedModules/goerli/account-based/AccountFactoryProxy.json"
import { delay } from "../03_various.";

async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Deploy AccountFactory on", chainId, "by", operator.address)

    // get Account Factory proxy
    const diamondFactoryProxy = await await ethers.getContractAt(AccountFactoryProxyAbi, (marginSwapAccountAddresses.accountFactoryProxy as any)[chainId], operator)
    console.log("Account Factory proxy obtained", diamondFactoryProxy.address)

    // deploy Account Factory logic
    const diamondFactoryFactory = await ethers.getContractFactory('OneDeltaAccountFactory')
    const diamondFactory = await diamondFactoryFactory.connect(operator).deploy()
    await diamondFactory.deployed()
    console.log("Account Factory logic", diamondFactory.address)

    // delay by 5000 ms so that flag for proxy is set
    await delay(5000)

    console.log("set implementation")
    await diamondFactoryProxy.connect(operator)._setPendingImplementation(diamondFactory.address)

    // delay by 10000 ms so that flag for proxy is set
    await delay(10000)

    console.log("accept implementation")
    await diamondFactory.connect(operator)._become(diamondFactoryProxy.address)

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// Account Factory logic 0xFBf295Ec3DF4cc1B41B38Ed48F39aaCA2eD8Bb7f
