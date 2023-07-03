import { ethers } from "hardhat";
import { marginSwapAccountAddresses } from "../../deploy/00_addresses";
import DataProviderProxy from "../../artifacts/contracts/1delta/account-based/data-providers/DataProviderProxy.sol/DataProviderProxy.json"
import { delay } from "../03_various.";

async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Deploy DataProvider on", chainId, "by", operator.address)

    // get DataProvider proxy
    const dataProviderProxy = await await ethers.getContractAt(DataProviderProxy.abi, (marginSwapAccountAddresses.dataProviderProxy as any)[chainId], operator)
    console.log("DataProvider proxy obtained", dataProviderProxy.address)

    // deploy DataProvider logic
    const dataProviderFactory = await ethers.getContractFactory('DataProvider')
    const dataProvider = await dataProviderFactory.connect(operator).deploy()
    await dataProvider.deployed()
    console.log("DataProvider logic", dataProvider.address)

    // delay by 5000 ms so that flag for proxy is set
    await delay(5000)

    console.log("set implementation")
    await dataProviderProxy.connect(operator)._setPendingImplementation(dataProvider.address)

    // delay by 10000 ms so that flag for proxy is set
    await delay(10000)

    console.log("accept implementation")
    await dataProvider.connect(operator)._become(dataProviderProxy.address)

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// DataProvider logic 0x5a7be0ab6100b4c815243296662E0957E14e6763

// npx hardhat verify --network goerli 0x5a7be0ab6100b4c815243296662E0957E14e6763  --contract contracts/1delta/account-based/data-providers/DataProvider.sol:DataProvider
