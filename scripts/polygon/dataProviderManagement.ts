import { ethers } from "hardhat";
import { marginSwapAccountAddresses, uniswapAddresses, generalAddresses, marginSwapAddresses } from "../../deploy/00_addresses"
import DataProviderArtifact from "../../artifacts/contracts/1delta/account-based/data-providers/DataProvider.sol/DataProvider.json"
import DataProviderProxyArtifact from "../../artifacts/contracts/1delta/account-based/data-providers/DataProviderProxy.sol/DataProviderProxy.json"
import { validateAddresses } from "../../utils/types"
import { delay } from "../03_various.";

// npx hardhat run scripts/goerli/account-based/replaceMoneyMarket.ts --network goerli

export const addressesCompoundTokens = [
    // [SupportedAssets.DAI]: {
    '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    //   [SupportedAssets.USDC]: {
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    //   [SupportedAssets.USDT]: {
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    //   [SupportedAssets.WBTC]: {
    '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
    //   [SupportedAssets.WETH]: {
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
    //   [SupportedAssets.MATIC]: {
    //   [SupportedAssets.MATICX]: {
    '0xfa68fb4628dff1028cfec22b4162fccd0d45efb6',
    //   [SupportedAssets.MIMATIC]: {
    '0x3a58a54c066fdc0f2d55fc9c89f0415c92ebf3c4'

]
export const addressesCompoundCTokens = [
    // [SupportedAssets.DAI]: {
    '0x2175110F2936bf630a278660E9B6E4EFa358490A',
    //   [SupportedAssets.USDC]: {
    '0xEBb865Bf286e6eA8aBf5ac97e1b56A76530F3fBe',
    //   [SupportedAssets.USDT]: {
    '0x1372c34acC14F1E8644C72Dad82E3a21C211729f',
    //   [SupportedAssets.WBTC]: {
    '0x3B9128Ddd834cE06A60B0eC31CCfB11582d8ee18',
    //   [SupportedAssets.WETH]: {
    '0xb2D9646A1394bf784E376612136B3686e74A325F',
    //   [SupportedAssets.MATIC]: {

    //   [SupportedAssets.MATICX]: {
    '0xAAcc5108419Ae55Bc3588E759E28016d06ce5F40',
    //   [SupportedAssets.MIMATIC]: {
    '0xC57E5e261d49Af3026446de3eC381172f17bB799'
]

export const cEther = '0xE554E874c9c60E45F1Debd479389C76230ae25A8'


//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    const wethAddress = (generalAddresses.WETH as any)[chainId]
    const routerAddress = (marginSwapAddresses.minimalRouter as any)[chainId]
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
    await delay(10000)
    
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
