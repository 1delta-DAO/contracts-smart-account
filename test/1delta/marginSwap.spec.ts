import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { constants } from 'ethers';
import { ethers, network } from 'hardhat'
import {
    SweeperModule,
    MarginTraderModule
} from '../../types';
import { FeeAmount } from '../uniswap-v3/periphery/shared/constants';
import { expandTo18Decimals } from '../uniswap-v3/periphery/shared/expandTo18Decimals';
import { encodePath } from '../uniswap-v3/periphery/shared/path';
import {
    accountFactoryFixture,
    AccountFactoryFixture,
    borrowFromCompound,
    createMarginTradingAccount,
    enterMarkets,
    feedCompound,
    feedProvider,
    getAbsoluteMarginTraderAccount,
    getMoneyMarketAccount,
    supplyToCompound
} from './shared/accountFactoryFixture';
import { expectToBeLess } from './shared/checkFunctions';
import { CompoundFixture, CompoundOptions, generateCompoundFixture } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { addLiquidity, uniswapFixture, UniswapFixture } from './shared/uniswapFixture';


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Account based single margin swaps', async () => {
    let deployer: SignerWithAddress
    let alice: SignerWithAddress
    let bob: SignerWithAddress
    let carol: SignerWithAddress
    let gabi: SignerWithAddress
    let achi: SignerWithAddress;
    let uniswap: UniswapFixture
    let compound: CompoundFixture
    let opts: CompoundOptions
    let accountAlice: MarginTraderModule
    let absAccountAlice: SweeperModule
    let accountFixture: AccountFactoryFixture
    let tokenAddresses: string[]


    before('Deploy Account, Trader, Uniswap and Compound', async () => {
        [deployer, alice, bob, carol, gabi, achi] = await ethers.getSigners();

        uniswap = await uniswapFixture(deployer, 5)

        accountFixture = await accountFactoryFixture(deployer, uniswap.factory, uniswap.weth9)

        opts = {
            underlyings: uniswap.tokens,
            collateralFactors: uniswap.tokens.map(x => ONE_18.mul(5).div(10)),
            exchangeRates: uniswap.tokens.map(x => ONE_18),
            borrowRates: uniswap.tokens.map(x => ONE_18),
            cEthExchangeRate: ONE_18,
            cEthBorrowRate: ONE_18,
            compRate: ONE_18,
            closeFactor: ONE_18
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

        await accountFixture.dataProvider.addComptroller(compound.comptroller.address)
        await accountFixture.dataProvider.setNativeWrapper(uniswap.weth9.address)
        await accountFixture.dataProvider.setRouter(uniswap.router.address)

        tokenAddresses = [...uniswap.tokens.map(tk => tk.address), uniswap.weth9.address]
        await feedProvider(deployer, accountFixture, uniswap, compound)
        await feedCompound(deployer, uniswap, compound)

        await addLiquidity(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[0].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        const poolAddress = await uniswap.factory.getPool(uniswap.tokens[1].address, uniswap.tokens[0].address, FeeAmount.MEDIUM)

        // add pool
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[1].address, uniswap.tokens[0].address, FeeAmount.MEDIUM, poolAddress)


    })

    it('allows margin swap exact in', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)

        const supplyTokenIndex = 1
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const params = {
            path,
            amountOutMinimum: swapAmount.mul(99).div(100),
            amountIn: swapAmount,
        }

        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)


        // execute margin swap
        await accountAlice.connect(alice).openMarginPositionExactIn(params)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrowAmount.toString()).to.equal(swapAmount.toString())
    })

    it('allows margin swap exact out', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyTokenIndex = 1
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            amountInMaximum: swapAmount.mul(101).div(100),
            amountOut: swapAmount,
        }


        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).openMarginPositionExactOut(params)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supply0.toString()).to.equal(providedAmount.add(swapAmount).toString())
    })



    it('allows margin trim exact in', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyTokenIndex = 1
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const repayIn = expandTo18Decimals(400)

        const routeIndexes = [borrowTokenIndex, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        let params = {
            path,
            amountInMaximum: swapAmount.mul(101).div(100),
            amountOut: swapAmount,
        }


        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).openMarginPositionExactOut(params)


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

       const paramsTrim = {
            path,
            amountOutMinimum: repayIn.mul(99).div(100),
            amountIn: repayIn,
        }

        const supplybefore = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountBefore = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        // execute margin swap closure
        await accountAlice.connect(alice).trimMarginPositionExactIn(paramsTrim)


        const supplyAfter = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountAfter = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supplybefore.sub(supplyAfter).toString()).to.equal(repayIn.toString())
        expectToBeLess(repayIn, borrowAmountBefore.sub(borrowAmountAfter), 0.99)
        expectToBeLess(borrowAmountBefore.sub(borrowAmountAfter), repayIn)
    })

    it('allows margin trim exact out', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyTokenIndex = 1
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        const repayOut = expandTo18Decimals(400)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            amountOutMinimum: swapAmount.mul(99).div(100),
            amountIn: swapAmount,
        }

        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)
        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).openMarginPositionExactIn(params)

        const paramsTrim = {
            path,
            amountInMaximum: repayOut.mul(105).div(100),
            amountOut: repayOut,
        }

        console.log('openMarginPositionExactIn')

        const supplybefore = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountBefore = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        // execute margin swap closure
        await accountAlice.connect(alice).trimMarginPositionExactOut(paramsTrim)

        const supplyAfter = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountAfter = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrowAmountBefore.sub(borrowAmountAfter)).to.equal(repayOut.toString())
        expectToBeLess(repayOut, supplybefore.sub(supplyAfter))
        expectToBeLess(supplybefore.sub(supplyAfter), repayOut, 0.99)
    })

    it('allows margin trim all in', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyTokenIndex = 3
        const swapTokenIndex = 1
        const borrowTokenIndex = 0

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const borrowAmount = expandTo18Decimals(450)


        // supply
        await supplyToCompound(alice, accountAlice.address, swapTokenIndex, expandTo18Decimals(100), uniswap)
        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex, expandTo18Decimals(1000), uniswap)
        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex, borrowAmount, uniswap)
        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")



        const supplybefore = await compound.cTokens[swapTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountBefore = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        absAccountAlice = await getAbsoluteMarginTraderAccount(alice, accountAlice.address)

        const routeIndexes = [borrowTokenIndex, swapTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const paramsTrim = {
            path,
            amountOutMinimum: supplybefore.mul(99).div(100),
        }


        // execute margin swap closure
        await absAccountAlice.connect(alice).trimMarginPositionAllIn(paramsTrim)


        const supplyAfter = await compound.cTokens[swapTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountAfter = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supplyAfter.toString()).to.equal('0')
        expectToBeLess(supplybefore, borrowAmountBefore.sub(borrowAmountAfter), 0.99)
        expectToBeLess(borrowAmountBefore.sub(borrowAmountAfter), supplybefore)
    })

    it('allows margin trim all out', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyTokenIndex = 1
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const params = {
            path,
            amountOutMinimum: swapAmount.mul(95).div(100),
            amountIn: swapAmount,
        }
        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)
        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).openMarginPositionExactIn(params)



        const supplybefore = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountBefore = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        absAccountAlice = await getAbsoluteMarginTraderAccount(alice, accountAlice.address)

        const repayOut = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        const paramsTrim = {
            path,
            amountInMaximum: repayOut.mul(105).div(100),
            amountOut: repayOut,
        }


        // execute margin swap closure
        await absAccountAlice.connect(alice).trimMarginPositionAllOut(paramsTrim)

        const supplyAfter = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountAfter = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrowAmountAfter.toString()).to.equal('0')
        expectToBeLess(supplybefore.sub(supplyAfter), repayOut, 0.99)
    })


    // it('function gatekeeper', async () => {
    //     // enter markets directly
    //     accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
    //     const supplyTokenIndex = 1
    //     const borrowTokenIndex = 0
    //     const providedAmount = expandTo18Decimals(500)
    //     const swapAmount = expandTo18Decimals(450)
    //     const repayIn = expandTo18Decimals(400)
    //     const repayOut = expandTo18Decimals(400)
    //     const revertMessage = 'Only the account owner can interact.'
    //     let params: any = {
    //         tokenIn: uniswap.tokens[borrowTokenIndex].address,
    //         tokenOut: uniswap.tokens[supplyTokenIndex].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountOutMinimum: providedAmount,
    //         amountIn: swapAmount,
    //     }
    //     await expect(
    //         accountAlice.connect(bob).openMarginPositionExactIn(params)
    //     ).to.be.revertedWith(revertMessage)


    //     params = {
    //         tokenIn: uniswap.tokens[borrowTokenIndex].address,
    //         tokenOut: uniswap.tokens[supplyTokenIndex].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountInMaximum: providedAmount,
    //         amountOut: swapAmount,
    //     }
    //     await expect(
    //         accountAlice.connect(bob).openMarginPositionExactOut(params)
    //     ).to.be.revertedWith(revertMessage)


    //     params = {
    //         tokenIn: uniswap.tokens[supplyTokenIndex].address,
    //         tokenOut: uniswap.tokens[borrowTokenIndex].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountOutMinimum: 0,
    //         amountIn: repayIn,
    //     }
    //     await expect(
    //         accountAlice.connect(bob).trimMarginPositionExactIn(params)
    //     ).to.be.revertedWith(revertMessage)

    //     const accountAliceAlt = await getAbsoluteMarginTraderAccount(alice, accountAlice.address)

    //     params = {
    //         tokenIn: uniswap.tokens[supplyTokenIndex].address,
    //         tokenOut: uniswap.tokens[borrowTokenIndex].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountOutMinimum: 0,
    //         amountIn: repayIn,
    //     }
    //     await expect(
    //         accountAliceAlt.connect(bob).trimMarginPositionAllIn(params)
    //     ).to.be.revertedWith(revertMessage)



    //     params = {
    //         tokenIn: uniswap.tokens[supplyTokenIndex].address,
    //         tokenOut: uniswap.tokens[borrowTokenIndex].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountInMaximum: providedAmount,
    //         amountOut: repayOut,
    //     }
    //     await expect(
    //         accountAlice.connect(bob).trimMarginPositionExactOut(params)
    //     ).to.be.revertedWith(revertMessage)


    //     params = {
    //         tokenIn: uniswap.tokens[supplyTokenIndex].address,
    //         tokenOut: uniswap.tokens[borrowTokenIndex].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountInMaximum: providedAmount,
    //         amountOut: repayOut,
    //     }
    //     await expect(
    //         accountAliceAlt.connect(bob).trimMarginPositionAllOut(params)
    //     ).to.be.revertedWith(revertMessage)

    // })

})


// ·----------------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                     Solc version: 0.8.20                                     ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ·······························································································|···························|·················|······························
// |  Methods                                                                                                                                                                 │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  openMarginPositionExactIn           ·     574423  ·     615568  ·         588143  ·            3  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  openMarginPositionExactOut          ·     573175  ·     573177  ·         573176  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  trimMarginPositionExactIn           ·          -  ·          -  ·         506215  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  trimMarginPositionExactOut          ·          -  ·          -  ·         490100  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  trimMarginPositionExactIn           ·          -  ·          -  ·         506215  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  trimMarginPositionExactOut          ·          -  ·          -  ·         490100  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············




