import '@nomiclabs/hardhat-ethers'
import { ethers } from "hardhat";
import { marginSwapAccountAddresses, } from "../../00_addresses";
import OneDeltaAccountFactoryArtifact from "../../../artifacts/contracts/1delta/OneDeltaAccountFactory.sol/OneDeltaAccountFactory.json"
import OneDeltaAccountFactoryProxyArtifact from "../../../artifacts/contracts/1delta/OneDeltaAccountFactoryProxy.sol/OneDeltaAccountFactoryProxy.json"
import { validateAddresses } from '../../../utils/types';
import { delay } from '../utils/delay';

async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    const manager = marginSwapAccountAddresses.moduleManager[chainId]
    const proxy = marginSwapAccountAddresses.dataProviderProxy[chainId]

    validateAddresses([manager, proxy])

    console.log("Deploy OneDeltaAccountFactory on", chainId, "by", operator.address)

    // deploy Account Factory proxy
    const diamondFactoryProxyFactory = await ethers.getContractFactory('OneDeltaAccountFactoryProxy')
    const diamondFactoryProxy = await diamondFactoryProxyFactory.connect(operator).deploy()
    await diamondFactoryProxy.deployed()
    console.log("Account Factory proxy", diamondFactoryProxy.address)

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

    console.log("create factory contract")
    const finalFactory = await ethers.getContractAt(
        [...OneDeltaAccountFactoryArtifact.abi, ...OneDeltaAccountFactoryProxyArtifact.abi],
        diamondFactoryProxy.address,
        operator
    )

    console.log("initialize factory")
    await finalFactory.connect(operator).initialize(
        manager,
        proxy
    )

    console.log("deployment and initialization done")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// Deploy AccountFactory on 5 by 0x4d6f46Ff41908A0920986aab432ab4A98E5Cbdeb
// Account Factory proxy 0xC2ef8d1288982451eEfB20671153CF14fa22e72A
// Account Factory logic 0xE0E43892492aF2fB92BC393d8b7E13d591cA8C2F


