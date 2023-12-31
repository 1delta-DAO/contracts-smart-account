import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { constants } from 'ethers';
import { ethers, network } from 'hardhat'
import {
    MarginTrading
} from '../../types';
import { FeeAmount } from '../uniswap-v3/periphery/shared/constants';
import { expandTo18Decimals } from '../uniswap-v3/periphery/shared/expandTo18Decimals';
import { encodePath } from '../uniswap-v3/periphery/shared/path';
import {
    accountFactoryFixtureInclV2,
    AccountFactoryFixtureWithV2,
    borrowFromCompound,
    createMarginTradingAccountWithV2,
    enterMarkets,
    feedCompound,
    feedProvider,
    getMoneyMarketAccount,
    supplyToCompound
} from './shared/accountFactoryFixture';
import { encodeAggregatorDataEthers, encodeAggregatorPathEthers } from './shared/aggregatorPath';
import { expectToBeLess } from './shared/checkFunctions';
import { CompoundFixture, CompoundOptions, generateCompoundFixture } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { addLiquidity, addLiquidityV2, uniswapFixture, UniswapFixture } from './shared/uniswapFixture';
import { uniV2Fixture, V2Fixture } from './shared/uniV2Fixture';


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
    let accountAlice: MarginTrading
    let accountFixture: AccountFactoryFixtureWithV2
    let tokenAddresses: string[]
    let uniswapV2: V2Fixture


    before('Deploy Account, Trader, Uniswap and Compound', async () => {
        [deployer, alice, bob, carol, gabi, achi] = await ethers.getSigners();

        uniswap = await uniswapFixture(deployer, 5)
        uniswapV2 = await uniV2Fixture(deployer, uniswap.weth9.address)

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

        accountFixture = await accountFactoryFixtureInclV2(deployer, uniswap.factory, uniswap.weth9, compound.cEther.address, uniswapV2.factoryV2.address)

        await accountFixture.dataProvider.addComptroller(compound.comptroller.address)
        await accountFixture.dataProvider.setNativeWrapper(uniswap.weth9.address)
        await accountFixture.dataProvider.setRouter(uniswap.router.address)

        tokenAddresses = [...uniswap.tokens.map(tk => tk.address), uniswap.weth9.address]
        await feedProvider(deployer, accountFixture, uniswap, compound)
        await feedCompound(deployer, uniswap, compound)


        await addLiquidityV2(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[0].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswapV2
        )

        await addLiquidityV2(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[2].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswapV2
        )

        await addLiquidityV2(
            deployer,
            uniswap.tokens[2].address,
            uniswap.tokens[3].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswapV2
        )

        await addLiquidityV2(
            deployer,
            uniswap.tokens[3].address,
            uniswap.tokens[4].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswapV2
        )


        await addLiquidity(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[0].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        await addLiquidity(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[2].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        await addLiquidity(
            deployer,
            uniswap.tokens[2].address,
            uniswap.tokens[3].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        await addLiquidity(
            deployer,
            uniswap.tokens[3].address,
            uniswap.tokens[4].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )
    })

    it.only('allows margin swap exact in', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)

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
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(99).div(100).toString(),
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6], // action
            [0], // pid
            2 // flag
        )

        const params = {
            path,
            amountOutMinimum: swapAmount.mul(99).div(100),
            amountIn: swapAmount,
        }

        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)


        // execute margin swap
        await accountAlice.connect(alice).swapExactIn(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrowAmount.toString()).to.equal(swapAmount.toString())
    })

    it.only('allows margin swap exact in multi', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)

        const supplyTokenIndex = 2
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, 1, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(99).div(100).toString(),
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0], // action
            [0, 0], // pid
            2 // flag
        )

        const params = {
            path,
            amountOutMinimum: swapAmount.mul(99).div(100),
            amountIn: swapAmount,
        }

        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        console.log("Open multi")
        // execute margin swap
        await accountAlice.connect(alice).swapExactIn(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrowAmount.toString()).to.equal(swapAmount.toString())
    })

    it.only('allows margin swap exact in multi 3-hop (1)', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)

        const supplyTokenIndex = 3
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, 1, 2, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(95).div(100).toString(),
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0, 0], // action
            [0, 0, 0], // pid
            2 // flag
        )

        const params = {
            path,
            amountOutMinimum: swapAmount.mul(95).div(100),
            amountIn: swapAmount,
        }

        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        console.log("Open multi")
        // execute margin swap
        await accountAlice.connect(alice).swapExactIn(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrowAmount.toString()).to.equal(swapAmount.toString())
    })

    it.only('allows margin swap exact in multi 3-hop (2)', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)

        const supplyTokenIndex = 3
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, 1, 2, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(95).div(100).toString(),
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0, 0], // action
            [0, 0, 0], // pid
            2 // flag
        )

        const params = {
            path,
            amountOutMinimum: swapAmount.mul(95).div(100),
            amountIn: swapAmount,
        }

        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        console.log("Open multi")
        // execute margin swap
        await accountAlice.connect(alice).swapExactIn(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrowAmount.toString()).to.equal(swapAmount.toString())
    })


    it.only('allows margin swap exact out', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
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
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(101).div(100).toString(),
            _tokensInRoute.reverse(),
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3], // action
            [0], // pid
            2 // flag
        )
        // const pair = await accountAlice.pairAddressExt(uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        // const val = await accountAlice.getAmountInByPool('450000000000000000000', pair, false)
        // const val2 = await accountAlice.getAmountInDirect(pair, false, '450000000000000000000')
        // console.log("TES", val.toString(), val2.toString())
        // console.log("supp, b", uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        const params = {
            path,
            amountInMaximum: swapAmount.mul(101).div(100),
            amountOut: swapAmount,
        }


        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).swapExactOut(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supply0.toString()).to.equal(providedAmount.add(swapAmount).toString())
    })

    it.only('allows margin swap exact out multi', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
        const supplyTokenIndex = 2
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, 1, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        console.log("_tokensInRoute", _tokensInRoute)
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(102).div(100).toString(),
            _tokensInRoute.reverse(),
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3, 1], // action
            [0, 0], // pid
            2 // flag
        )
        // const pair = await accountAlice.pairAddressExt(uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        // const val = await accountAlice.getAmountInByPool('450000000000000000000', pair, false)
        // const val2 = await accountAlice.getAmountInDirect(pair, false, '450000000000000000000')
        // console.log("TES", val.toString(), val2.toString())
        // console.log("supp, b", uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        const params = {
            path,
            amountInMaximum: swapAmount.mul(102).div(100),
            amountOut: swapAmount,
        }


        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).swapExactOut(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supply0.toString()).to.equal(providedAmount.add(swapAmount).toString())
    })

    it.only('allows margin swap exact out multi 3-hop', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
        const supplyTokenIndex = 3
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, 1, 2, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        console.log("_tokensInRoute", _tokensInRoute)
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(104).div(100).toString(),
            _tokensInRoute.reverse(),
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3, 1, 1], // action
            [0, 0, 0], // pid
            2 // flag
        )
        // const pair = await accountAlice.pairAddressExt(uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        // const val = await accountAlice.getAmountInByPool('450000000000000000000', pair, false)
        // const val2 = await accountAlice.getAmountInDirect(pair, false, '450000000000000000000')
        // console.log("TES", val.toString(), val2.toString())
        // console.log("supp, b", uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        const params = {
            path,
            amountInMaximum: swapAmount.mul(104).div(100),
            amountOut: swapAmount,
        }


        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).swapExactOut(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supply0.toString()).to.equal(providedAmount.add(swapAmount).toString())
    })

    it.only('allows margin swap exact out multi 3-hop mixed', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
        const supplyTokenIndex = 3
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, 1, 2, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        console.log("_tokensInRoute", _tokensInRoute)
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(105).div(100).toString(),
            _tokensInRoute.reverse(),
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3, 1, 1], // action
            [0, 1, 0], // pid
            2 // flag
        )
        // const pair = await accountAlice.pairAddressExt(uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        // const val = await accountAlice.getAmountInByPool('450000000000000000000', pair, false)
        // const val2 = await accountAlice.getAmountInDirect(pair, false, '450000000000000000000')
        // console.log("TES", val.toString(), val2.toString())
        // console.log("supp, b", uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        const params = {
            path,
            amountInMaximum: swapAmount.mul(105).div(100),
            amountOut: swapAmount,
        }


        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).swapExactOut(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supply0.toString()).to.equal(providedAmount.add(swapAmount).toString())
    })

    it.only('allows margin swap exact out multi 3-hop mixed, start, end V3', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
        const supplyTokenIndex = 3
        const borrowTokenIndex = 0
        const providedAmount = expandTo18Decimals(500)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(450)

        const routeIndexes = [borrowTokenIndex, 1, 2, supplyTokenIndex]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        console.log("_tokensInRoute", _tokensInRoute)
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorDataEthers(
            swapAmount.toString(),
            swapAmount.mul(105).div(100).toString(),
            _tokensInRoute.reverse(),
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3, 1, 1], // action
            [1, 0, 1], // pid
            2 // flag
        )
        // const pair = await accountAlice.pairAddressExt(uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        // const val = await accountAlice.getAmountInByPool('450000000000000000000', pair, false)
        // const val2 = await accountAlice.getAmountInDirect(pair, false, '450000000000000000000')
        // console.log("TES", val.toString(), val2.toString())
        // console.log("supp, b", uniswap.tokens[supplyTokenIndex].address, uniswap.tokens[borrowTokenIndex].address)
        const params = {
            path,
            amountInMaximum: swapAmount.mul(105).div(100),
            amountOut: swapAmount,
        }


        await uniswap.tokens[supplyTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyTokenIndex].address, providedAmount)

        // execute margin swap
        await accountAlice.connect(alice).swapExactOut(params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmount = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supply0.toString()).to.equal(providedAmount.add(swapAmount).toString())
    })

    it('allows margin trim exact in', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
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
        await accountAlice.connect(alice).swapExactOut(params)


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
        await accountAlice.connect(alice).swapExactIn(paramsTrim)


        const supplyAfter = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountAfter = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(supplybefore.sub(supplyAfter).toString()).to.equal(repayIn.toString())
        expectToBeLess(repayIn, borrowAmountBefore.sub(borrowAmountAfter), 0.99)
        expectToBeLess(borrowAmountBefore.sub(borrowAmountAfter), repayIn)
    })

    it('allows margin trim exact out', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
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
        await accountAlice.connect(alice).swapExactIn(params)

        const paramsTrim = {
            path,
            amountInMaximum: repayOut.mul(105).div(100),
            amountOut: repayOut,
        }

        console.log('swapExactIn')

        const supplybefore = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountBefore = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        // execute margin swap closure
        await accountAlice.connect(alice).swapExactOut(paramsTrim)

        const supplyAfter = await compound.cTokens[supplyTokenIndex].balanceOf(accountAlice.address)
        const borrowAmountAfter = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrowAmountBefore.sub(borrowAmountAfter)).to.equal(repayOut.toString())
        expectToBeLess(repayOut, supplybefore.sub(supplyAfter))
        expectToBeLess(supplybefore.sub(supplyAfter), repayOut, 0.99)
    })

    it('allows margin trim all in', async () => {
        // enter markets directly
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
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
        accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
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
        await accountAlice.connect(alice).swapExactIn(params)



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
    //     accountAlice = await createMarginTradingAccountWithV2(alice, accountFixture, true)
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
    //         accountAlice.connect(bob).swapExactIn(params)
    //     ).to.be.revertedWith(revertMessage)


    //     params = {
    //         tokenIn: uniswap.tokens[borrowTokenIndex].address,
    //         tokenOut: uniswap.tokens[supplyTokenIndex].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountInMaximum: providedAmount,
    //         amountOut: swapAmount,
    //     }
    //     await expect(
    //         accountAlice.connect(bob).swapExactOut(params)
    //     ).to.be.revertedWith(revertMessage)


    //     params = {
    //         tokenIn: uniswap.tokens[supplyTokenIndex].address,
    //         tokenOut: uniswap.tokens[borrowTokenIndex].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountOutMinimum: 0,
    //         amountIn: repayIn,
    //     }
    //     await expect(
    //         accountAlice.connect(bob).swapExactIn(params)
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
    //         accountAlice.connect(bob).swapExactOut(params)
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
// |                                     Solc version: 0.8.23                                     ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ·······························································································|···························|·················|······························
// |  Methods                                                                                                                                                                 │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  trimMarginPositionAllIn             ·          -  ·          -  ·         505310  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  trimMarginPositionAllOut            ·          -  ·          -  ·         485414  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············


// pre calldata upgrade
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactIn                         ·     596504  ·     712099  ·         660634  ·            4  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactOut                        ·     555655  ·     674941  ·         639138  ·            5  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············

// post calldata upgrade

// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactIn                         ·     596311  ·     710238  ·         659415  ·            4  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactOut                        ·     555455  ·     673117  ·         637808  ·            5  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············


// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactIn                         ·     595893  ·     709820  ·         658997  ·            4  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactOut                        ·     555081  ·     672743  ·         637434  ·            5  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············

// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactIn                         ·     595911  ·     709838  ·         659015  ·            4  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactOut                        ·     555055  ·     672717  ·         637408  ·            5  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············

// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactIn                         ·     595905  ·     709832  ·         659009  ·            4  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTrading                                        ·  swapExactOut                        ·     555049  ·     672711  ·         637402  ·            5  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
