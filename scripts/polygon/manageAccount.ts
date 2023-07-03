import { ethers } from "hardhat";
import MoneyMarketAbi from "../../deployedModules/goerli/account-based/MoneyMarketModule.json"
import { delay } from "../03_various.";

// npx hardhat run scripts/polygon/account-based/replaceMoneyMarket.ts --network matic

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


//only works if selectors match exactly
async function main() {

    const accounts = await ethers.getSigners()
    const operator = accounts[0]
    const chainId = await operator.getChainId();

    console.log("Manage Account on", chainId, "by", operator.address)


    //     const moneyMarketModule = await ethers.getContractAt(
    //         MoneyMarketAbi,
    //         "0x992380F666b752045978811065B36E2e5888051d",
    //         operator
    //     )
    //    const router =  await moneyMarketModule.approveUnderlyings(['0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'])


    // const admin = await ethers.getContractAt('AdminModule', '0x992380F666b752045978811065B36E2e5888051d', operator)

    // await admin.updataDataProvider()
    // await delay(5000)

    // APPROVAL ASSET ARG 0x2791bca1f2de4661ed88a30c99a7a9449aa84174 0xEBb865Bf286e6eA8aBf5ac97e1b56A76530F3fBe BigNumber {_hex: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', _isBigNumber: true}
    const tokenManager = await ethers.getContractAt('TokenManagerModule', '0xc12c2b28Df7aB2b03A4A4341b114B0316e6Cb57E', operator)

    await tokenManager.approveSpending("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xEBb865Bf286e6eA8aBf5ac97e1b56A76530F3fBe", ethers.constants.MaxUint256)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });