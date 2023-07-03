import '@nomiclabs/hardhat-ethers'
import { ethers } from "hardhat";
import { generalAddresses, uniswapAddresses } from "../../00_addresses";
import { validateAddresses } from "../../../utils/types";
import { MinimalSwapRouter, MinimalSwapRouter__factory } from "../../../types"

async function main() {
    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    // address parameters
    const uniswapFactoryAddress = uniswapAddresses.factory[chainId]
    const wethAddress = generalAddresses.WETH[chainId]

    validateAddresses([uniswapFactoryAddress])
    console.log("Deploy Router on", chainId, "by", operator.address)

    // deploy ConfigModule
    const router = await new MinimalSwapRouter__factory(operator).deploy(uniswapFactoryAddress, wethAddress)
    await router.deployed()
    console.log('Completed router deployment:', router.address)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });