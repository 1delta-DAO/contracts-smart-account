import { ethers } from "hardhat";
import { marginSwapAccountAddresses, uniswapAddresses, generalAddresses } from "../../deploy/00_addresses"
import DataProviderArtifact from "../../artifacts/contracts/1delta/account-based/data-providers/DataProvider.sol/DataProvider.json"
import DataProviderProxyArtifact from "../../artifacts/contracts/1delta/account-based/data-providers/DataProviderProxy.sol/DataProviderProxy.json"
import { delay } from "../03_various.";

// npx hardhat run scripts/goerli/account-based/replaceMoneyMarket.ts --network goerli

export const addressesCompoundTokens = [
    '0x2899a03ffDab5C90BADc5920b4f53B0884EB13cC',
    '0x208F73527727bcB2D9ca9bA047E3979559EB08cC',
    '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
    '0x79C950C7446B234a6Ad53B908fBF342b01c4d446',
    '0xAAD4992D949f9214458594dF92B44165Fb84dC19',

]
export const addressesCompoundCTokens = [
    '0x0545a8eaF7ff6bB6F708CbB544EA55DBc2ad7b2a',
    '0x2073d38198511F5Ed8d893AB43A03bFDEae0b1A5',
    '0x73506770799Eb04befb5AaE4734e58C2C624F493',
    '0x5A74332C881Ea4844CcbD8458e0B6a9B04ddb716',
    '0xDa6F609F3636062E06fFB5a1701Df3c5F1ab3C8f',
]

export const cEther = '0x64078a6189Bf45f80091c6Ff2fCEe1B15Ac8dbde'

//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    const wethAddress = (generalAddresses.WETH as any)[chainId ?? 5]
    const routerAddress = (uniswapAddresses.router as any)[chainId]
    // address parameters
    const dataProviderAddress = (marginSwapAccountAddresses as any).dataProviderProxy || ethers.constants.AddressZero

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
