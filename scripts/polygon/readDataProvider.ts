import { ethers } from "hardhat";
import { marginSwapAccountAddresses } from "../../deploy/00_addresses";
import DataProvider from "../../artifacts/contracts/1delta/data-providers/DataProvider.sol/DataProvider.json"

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

async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Deploy DataProvider on", chainId, "by", operator.address)

    // get DataProvider proxy
    const dataProviderProxy = await await ethers.getContractAt(DataProvider.abi, (marginSwapAccountAddresses.dataProviderProxy as any)[chainId], operator)
    console.log("DataProvider proxy obtained", dataProviderProxy.address)

    for (let i = 0; i < addressesCompoundTokens.length; i++) {
        console.log("index", i)
        const tok = await dataProviderProxy.cToken(addressesCompoundTokens[i])
        console.log(tok)
    }

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// DataProvider logic 0x5a7be0ab6100b4c815243296662E0957E14e6763

// npx hardhat verify --network goerli 0x5a7be0ab6100b4c815243296662E0957E14e6763  --contract contracts/1delta/account-based/data-providers/DataProvider.sol:DataProvider
