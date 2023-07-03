import '@nomiclabs/hardhat-ethers'
import hre from 'hardhat'
import { delay } from '../utils/delay';

async function main() {
    const accounts = await hre.ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Deploy DataProvider on", chainId, "by", operator.address)

    // deploy data provider proxy
    const dataProviderProxyFactory = await hre.ethers.getContractFactory('DataProviderProxy')
    const dataProviderProxy = await dataProviderProxyFactory.connect(operator).deploy()
    await dataProviderProxy.deployed()
    console.log("Data provider proxy", dataProviderProxy.address)

    // deploy data provider logic
    const dataProviderFactory = await hre.ethers.getContractFactory('DataProvider')
    const dataProvider = await dataProviderFactory.connect(operator).deploy()
    await dataProvider.deployed()
    console.log("Data provider logic", dataProvider.address)

    console.log("set implementation")

    await dataProviderProxy.connect(operator)._setPendingImplementation(dataProvider.address)

    // delay by 10000 ms so that flag for proxy is set
    await delay(10000)

    console.log("accept implementation")
    await dataProvider.connect(operator)._become(dataProviderProxy.address)

    console.log("deployment and initialization done")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// Deploy DataProvider on 5 by 0x4d6f46Ff41908A0920986aab432ab4A98E5Cbdeb
// Data provider proxy 0x178E4EB141BBaEAcd56DAE120693D48d4B5f198d
// Data provider logic 0xa72C1B9057F6119ad3d6A68A7559350DaB215B9E
