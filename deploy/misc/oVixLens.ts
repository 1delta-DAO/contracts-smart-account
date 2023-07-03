import '@nomiclabs/hardhat-ethers'
import hre from 'hardhat'

function delay(delayInms) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(2);
        }, delayInms);
    });
}

async function main() {

    const accounts = await hre.ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();
    console.log("Deploy with", operator.address, "on", chainId)
    const compoundViewLensFactory = await hre.ethers.getContractFactory('OVixLens')
    const compoundViewLens = await compoundViewLensFactory.deploy()
    await compoundViewLens.deployed()
    console.log("Constract address", compoundViewLens.address)

    console.log("deployment and initialization done")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

