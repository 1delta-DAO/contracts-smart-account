import { ethers } from "hardhat";
import { marginSwapAccountAddresses, uniswapAddresses, generalAddresses } from "../../deploy/00_addresses"
import DataProviderArtifact from "../../artifacts/contracts/1delta/account-based/data-providers/DataProvider.sol/DataProvider.json"
import DataProviderProxyArtifact from "../../artifacts/contracts/1delta/account-based/data-providers/DataProviderProxy.sol/DataProviderProxy.json"
import { validateAddresses } from "../../utils/types"
import { delay } from "../03_various.";

// npx hardhat run scripts/goerli/account-based/replaceMoneyMarket.ts --network goerli

export const addressesCompoundTokens = [
    '0xcb9F13Cb8cCA0ECfE908AbBfa25D1fc16C1aaE6d',
    '0x4413dbCf851D73bEc0BBF50b474EA89bded11153',
    '0x2ed82022025374fcC839D557c7a360099244e06b',
    '0xF151CC6EE64046342D8287660596fb78D2212A23',
    '0xFcCea9c3bb8e2fEFE9E2c7EFa1C63890Cf6F69b6',

]
export const addressesCompoundCTokens = [
    '0xcB1e72786A6eb3b44C2a2429e317c8a2462CFeb1',
    '0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747',
    '0x3813e82e6f7098b9583FC0F33a962D02018B6803',
    '0xEB8df6700E24802a5D435E5B0e4228065CA9E0f3',
    '0x714550C2C1Ea08688607D86ed8EeF4f5E4F22323'
]

export const cEther = '0xcf48fD4dF32097f482809E45E361C9667df32F90'

//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    const wethAddress = (generalAddresses.WETH as any)[chainId]
    const routerAddress = (uniswapAddresses.router as any)[chainId]
    // address parameters
    const dataProviderAddress = (marginSwapAccountAddresses.dataProviderProxy as any)[chainId] || ethers.constants.AddressZero

    validateAddresses([wethAddress, routerAddress, dataProviderAddress])

    console.log("Manage DataProvider on", chainId, "by", operator.address)

    const dataProvider = await ethers.getContractAt(
        [...DataProviderArtifact.abi, ...DataProviderProxyArtifact.abi],
        dataProviderAddress,
        operator
    )
    console.log('Data Provider gotten:', dataProvider.address)

    for (let i = 0; i < addressesCompoundTokens.length; i++) {
        console.log("index", i)
        await dataProvider.addCToken(addressesCompoundTokens[i], addressesCompoundCTokens[i])
        await delay(5000)
    }

    console.log('setNativeWrapper', wethAddress)
    await dataProvider.setNativeWrapper(wethAddress)
    await delay(10000)

    console.log('setRouter', routerAddress)
    await dataProvider.setRouter(routerAddress)
    await delay(10000)

    console.log('setCEther', cEther)
    await dataProvider.setCEther(cEther)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

    // Margin Trader 0xfa7a7593b200BaE227948c2968fd2655fb56CBf1
    // Money Market 0x250F0D1da6a2211106927704A11423F55EfD4B4F
    // Uniswap Callback 0x6c5BaE88D2aE38a01bA291aBDA742F6EA5E9c86e
