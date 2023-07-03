import { ethers } from "hardhat";
import { ModuleConfigAction, getSelectors } from "../../test/diamond/libraries/diamond"
import { generalAddresses, marginSwapAddresses, uniswapAddresses } from "../00_addresses";


function delay(delayInms) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(2);
        }, delayInms);
    });
}

async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();
    console.log("Deploy with", operator.address, "on", chainId)
    const priceSetterFactory = await ethers.getContractFactory('TestnetPriceSetter')
    const priceSetter = await priceSetterFactory.deploy()
    await priceSetter.deployed()
    console.log("Constract address", priceSetter.address)

    console.log("deployment and initialization done")
}

// deployed on 0xfb2Eaa2EF6a261F9f0E1ABBE0EB426A62A0755BD

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

