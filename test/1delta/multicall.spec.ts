import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { constants } from 'ethers';
import { ethers, network } from 'hardhat'
import { MarginTraderModule } from '../../types';
import { FeeAmount } from '../uniswap-v3/periphery/shared/constants';
import { expandTo18Decimals } from '../uniswap-v3/periphery/shared/expandTo18Decimals';
import { encodePath } from '../uniswap-v3/periphery/shared/path';
import {
    accountFactoryFixture,
    AccountFactoryFixture,
    createMarginTradingAccount,
    createMoneyMarketAccount,
    enterMarkets,
    feedCompound,
    feedCompoundETH,
    feedProvider,
    getMoneyMarketContract,
    getRawAccount,
    repayBorrowToCompound
} from './shared/accountFactoryFixture';
import { CompoundFixture, CompoundOptions, generateCompoundFixture } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { addLiquidity, uniswapFixture, UniswapFixture } from './shared/uniswapFixture';


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Diamond Money Market operations', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress, gabi: SignerWithAddress, achi: SignerWithAddress;
    let uniswap: UniswapFixture
    let compound: CompoundFixture
    let opts: CompoundOptions
    let accountAlice: MarginTraderModule
    let accountBob: MarginTraderModule
    let accountAchi: MarginTraderModule
    let accountGabi: MarginTraderModule
    let accountFixture: AccountFactoryFixture
    let tokenAddresses: string[]

    before('Deploy Account, Trader, Uniswap and Compound', async () => {
        [deployer, alice, bob, carol, gabi, achi] = await ethers.getSigners();

        uniswap = await uniswapFixture(deployer, 5)

        accountFixture = await accountFactoryFixture(deployer, uniswap.factory, uniswap.weth9)

        accountAlice = await createMarginTradingAccount(alice, accountFixture)

        accountBob = await createMarginTradingAccount(bob, accountFixture)

        accountAchi = await createMarginTradingAccount(achi, accountFixture)

        accountGabi = await createMarginTradingAccount(gabi, accountFixture)

        opts = {
            underlyings: uniswap.tokens,
            collateralFactors: uniswap.tokens.map(x => ONE_18.mul(7).div(10)),
            exchangeRates: uniswap.tokens.map(x => ONE_18),
            borrowRates: uniswap.tokens.map(x => ONE_18),
            cEthExchangeRate: ONE_18,
            cEthBorrowRate: ONE_18,
            compRate: ONE_18,
            closeFactor: ONE_18,
            ethCollateralFactor: ONE_18.mul(7).div(10)
        }

        // approve & fund wallets
        for (const token of uniswap.tokens) {
            await token.approve(uniswap.router.address, constants.MaxUint256)
            await token.approve(uniswap.nft.address, constants.MaxUint256)

            await token.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(bob).approve(uniswap.nft.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.nft.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.nft.address, constants.MaxUint256)

            await token.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.router.address, constants.MaxUint256)

            await token.connect(deployer).transfer(bob.address, expandTo18Decimals(1_000_000))
            await token.connect(deployer).transfer(alice.address, expandTo18Decimals(1_000_000))
            await token.connect(deployer).transfer(carol.address, expandTo18Decimals(1_000_000))

            await token.connect(deployer).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.router.address, constants.MaxUint256)
        }

        compound = await generateCompoundFixture(deployer, opts)
        tokenAddresses = uniswap.tokens.map(tk => tk.address)

        await accountFixture.dataProvider.addComptroller(compound.comptroller.address)
        await accountFixture.dataProvider.setNativeWrapper(uniswap.weth9.address)
        await accountFixture.dataProvider.setRouter(uniswap.router.address)

        await feedProvider(deployer, accountFixture, uniswap, compound)
        await feedCompound(deployer, uniswap, compound)
        await feedCompoundETH(deployer, compound)



        console.log("add 0 1")
        await addLiquidity(
            deployer,
            uniswap.tokens[0].address,
            uniswap.tokens[1].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add 1 2")
        await addLiquidity(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[2].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add 2 3")
        await addLiquidity(
            deployer,
            uniswap.tokens[2].address,
            uniswap.tokens[3].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        let poolAddress = await uniswap.factory.getPool(uniswap.tokens[0].address, uniswap.tokens[1].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[0].address, uniswap.tokens[1].address, FeeAmount.MEDIUM, poolAddress)

        poolAddress = await uniswap.factory.getPool(uniswap.tokens[1].address, uniswap.tokens[2].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[1].address, uniswap.tokens[2].address, FeeAmount.MEDIUM, poolAddress)

        poolAddress = await uniswap.factory.getPool(uniswap.tokens[2].address, uniswap.tokens[3].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[2].address, uniswap.tokens[3].address, FeeAmount.MEDIUM, poolAddress)



        // enter market
        await enterMarkets(alice, accountAlice.address, compound)
        await enterMarkets(bob, accountBob.address, compound)
        await enterMarkets(achi, accountAchi.address, compound)
        await enterMarkets(gabi, accountGabi.address, compound)

        let mmC = await getMoneyMarketContract(accountAlice.address)
        await (mmC.connect(alice)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountBob.address)
        await (mmC.connect(bob)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountAchi.address)
        await (mmC.connect(achi)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        mmC = await getMoneyMarketContract(accountGabi.address)
        await (mmC.connect(gabi)).approveUnderlyings(uniswap.tokens.map(t => t.address))

        await accountFixture.dataProvider.setNativeWrapper(uniswap.weth9.address)
        await accountFixture.dataProvider.setRouter(uniswap.router.address)

    })

    // it('allows multicall single module', async () => {

    //     const supplyAmount = expandTo18Decimals(1_000)
    //     const supplyTokenIndex = 1
    //     const borrowAmount = expandTo18Decimals(100)
    //     const borrowTokenIndex = 0

    //     const accountAliceNew = await createMoneyMarketAccount(alice, accountFixture, true)
    //     const accountRaw = await getRawAccount(alice, accountAliceNew.address)

    //     await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAliceNew.address, ethers.constants.MaxUint256)

    //     await accountRaw.multicallSingleModule(accountFixture.moneyMarketModule.address, [
    //         accountFixture.moneyMarketModule.interface.encodeFunctionData('mint', [uniswap.tokens[supplyTokenIndex].address, supplyAmount.toString()]),
    //         accountFixture.moneyMarketModule.interface.encodeFunctionData('borrow', [uniswap.tokens[borrowTokenIndex].address, alice.address, borrowAmount.toString()])
    //     ])

    //     await network.provider.send("evm_increaseTime", [3600])
    //     await network.provider.send("evm_mine")
    //     await uniswap.tokens[borrowTokenIndex].connect(alice).approve(accountAliceNew.address, constants.MaxUint256)
    //     await repayBorrowToCompound(alice, accountAliceNew.address, borrowTokenIndex, borrowAmount, uniswap)
    // })

    it('allows multicall multi module', async () => {

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0

        const accountAliceNew = await createMoneyMarketAccount(alice, accountFixture, true)
        const accountRaw = await getRawAccount(alice, accountAliceNew.address)

        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAliceNew.address, ethers.constants.MaxUint256)

        await accountRaw.multicall([accountFixture.moneyMarketModule.address, accountFixture.moneyMarketModule.address], [
            accountFixture.moneyMarketModule.interface.encodeFunctionData('mint', [uniswap.tokens[supplyTokenIndex].address, supplyAmount.toString()]),
            accountFixture.moneyMarketModule.interface.encodeFunctionData('borrow', [uniswap.tokens[borrowTokenIndex].address, alice.address, borrowAmount.toString()])
        ])

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")
        await uniswap.tokens[borrowTokenIndex].connect(alice).approve(accountAliceNew.address, constants.MaxUint256)
        await repayBorrowToCompound(alice, accountAliceNew.address, borrowTokenIndex, borrowAmount, uniswap)
    })

    it('allows multicall multi module swap', async () => {

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 2
        const borrowAmount = expandTo18Decimals(100)
        const supplyTokenIndexSwap = 3

        const supplyAmountSwap = expandTo18Decimals(100)
        const borrowTokenIndex = 0
        const routeIndexes = [0, 1, 2, 3]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await uniswap.tokens[supplyTokenIndexSwap].connect(bob).approve(accountBob.address, constants.MaxUint256)
        await uniswap.tokens[supplyTokenIndex].connect(bob).approve(accountBob.address, constants.MaxUint256)

        const params = {
            path,
            userAmountProvided: supplyAmountSwap,
            amountIn: swapAmount,
            amountOutMinimum: 0
        }

        await uniswap.tokens[supplyTokenIndex].connect(bob).approve(accountBob.address, ethers.constants.MaxUint256)
        const accountBobRaw = await getRawAccount(bob, accountBob.address)
        await accountBobRaw.multicall(
            [
                accountFixture.moneyMarketModule.address,
                accountFixture.moneyMarketModule.address,
                accountFixture.marginTraderModule.address
            ], [
            accountFixture.moneyMarketModule.interface.encodeFunctionData('mint', [uniswap.tokens[supplyTokenIndex].address, supplyAmount.toString()]),
            accountFixture.moneyMarketModule.interface.encodeFunctionData('borrow', [uniswap.tokens[borrowTokenIndex].address, alice.address, borrowAmount.toString()]),
            accountFixture.marginTraderModule.interface.encodeFunctionData('openMarginPositionExactIn', [params])
        ]
        )
    })

    it('gatekeep', async () => {

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 2
        const borrowAmount = expandTo18Decimals(100)
        const supplyTokenIndexSwap = 3

        const revertMessage = 'Only the account owner can interact.'
        const supplyAmountSwap = expandTo18Decimals(100)
        const borrowTokenIndex = 0
        const routeIndexes = [0, 1, 2, 3]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await uniswap.tokens[supplyTokenIndexSwap].connect(bob).approve(accountBob.address, constants.MaxUint256)
        await uniswap.tokens[supplyTokenIndex].connect(bob).approve(accountBob.address, constants.MaxUint256)

        const params = {
            path,
            userAmountProvided: supplyAmountSwap,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256
        }

        await uniswap.tokens[supplyTokenIndex].connect(bob).approve(accountBob.address, ethers.constants.MaxUint256)
        const accountBobRaw = await getRawAccount(bob, accountBob.address)
        await expect(accountBobRaw.connect(alice).multicall(
            [
                accountFixture.moneyMarketModule.address,
                accountFixture.moneyMarketModule.address,
                accountFixture.marginTraderModule.address
            ], [
            accountFixture.moneyMarketModule.interface.encodeFunctionData('mint', [uniswap.tokens[supplyTokenIndex].address, supplyAmount.toString()]),
            accountFixture.moneyMarketModule.interface.encodeFunctionData('borrow', [uniswap.tokens[borrowTokenIndex].address, alice.address, borrowAmount.toString()]),
            accountFixture.marginTraderModule.interface.encodeFunctionData('openMarginPositionExactIn', [params])
        ]
        )).to.be.revertedWith(revertMessage)



        await expect(accountBobRaw.connect(bob).multicall(
            [
                accountFixture.moneyMarketModule.address,
                accountFixture.moneyMarketModule.address,
                alice.address
            ], [
            accountFixture.moneyMarketModule.interface.encodeFunctionData('mint', [uniswap.tokens[supplyTokenIndex].address, supplyAmount.toString()]),
            accountFixture.moneyMarketModule.interface.encodeFunctionData('borrow', [uniswap.tokens[borrowTokenIndex].address, alice.address, borrowAmount.toString()]),
            accountFixture.marginTraderModule.interface.encodeFunctionData('openMarginPositionExactIn', [params])
        ]
        )).to.be.revertedWith("OneDeltaModuleManager: Invalid module")
    })
})


// ·----------------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                     Solc version: 0.8.20                                     ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ·······························································································|···························|·················|······························
// ························································|······································|·············|·············|·················|···············|··············
// |  OneDeltaAccount                                      ·  multicall                           ·     559946  ·    1031548  ·         795747  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············




