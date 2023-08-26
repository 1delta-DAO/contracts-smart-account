import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { MockProvider } from 'ethereum-waffle';
import { constants } from 'ethers';
import { ethers, network, waffle } from 'hardhat'
import {
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
    feedCompoundETH,
    feedProvider,
    getAbsoluteMarginTraderAccount,
    getMoneyMarketAccount,
    getMoneyMarketContract,
    supplyToCompound
} from './shared/accountFactoryFixture';
import { encodeAggregatorPathEthers } from './shared/aggregatorPath';
import { expectToBeLess } from './shared/checkFunctions';
import { CompoundFixture, CompoundOptions, generateCompoundFixture, ZERO } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { addLiquidity, uniswapFixture, UniswapFixture } from './shared/uniswapFixture';


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Margin Multi Swap operations', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress, gabi: SignerWithAddress, achi: SignerWithAddress;
    let uniswap: UniswapFixture
    let compound: CompoundFixture
    let opts: CompoundOptions
    let accountAlice: MarginTraderModule
    let accountBob: MarginTraderModule
    let accountAchi: MarginTraderModule
    let accountGabi: MarginTraderModule
    let accountFixture: AccountFactoryFixture
    let wethAddress: string
    let tokenAddresses: string[]
    let provider: MockProvider

    before('Deploy Account, Trader, Uniswap and Compound', async () => {
        [deployer, alice, bob, carol, gabi, achi] = await ethers.getSigners();

        provider = waffle.provider;

        uniswap = await uniswapFixture(deployer, 5)

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
            await token.connect(deployer).transfer(achi.address, expandTo18Decimals(1_000_000))
            await token.connect(deployer).transfer(gabi.address, expandTo18Decimals(1_000_000))

            await token.connect(deployer).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(carol).approve(uniswap.router.address, constants.MaxUint256)
            await token.connect(alice).approve(uniswap.router.address, constants.MaxUint256)
        }

        // weth handling
        // approve
        await uniswap.weth9.connect(deployer).approve(uniswap.nft.address, constants.MaxUint256)
        await uniswap.weth9.connect(deployer).approve(uniswap.router.address, constants.MaxUint256)
        await uniswap.weth9.connect(bob).approve(uniswap.router.address, constants.MaxUint256)
        await uniswap.weth9.connect(carol).approve(uniswap.router.address, constants.MaxUint256)
        await uniswap.weth9.connect(alice).approve(uniswap.router.address, constants.MaxUint256)

        // deposit
        await uniswap.weth9.connect(deployer).deposit({ value: expandTo18Decimals(100) })
        await uniswap.weth9.connect(bob).deposit({ value: expandTo18Decimals(100) })
        await uniswap.weth9.connect(achi).deposit({ value: expandTo18Decimals(100) })
        await uniswap.weth9.connect(carol).deposit({ value: expandTo18Decimals(100) })
        await uniswap.weth9.connect(alice).deposit({ value: expandTo18Decimals(100) })


        compound = await generateCompoundFixture(deployer, opts)

        accountFixture = await accountFactoryFixture(deployer, uniswap.factory, uniswap.weth9, compound.cEther.address, uniswap.factory.address)

        await accountFixture.dataProvider.addComptroller(compound.comptroller.address)
        await accountFixture.dataProvider.setCEther(compound.cEther.address)

        wethAddress = uniswap.weth9.address

        tokenAddresses = [...uniswap.tokens.map(tk => tk.address), wethAddress]

        await uniswap.weth9.connect(deployer).deposit({ value: expandTo18Decimals(1_000) })

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

        console.log("add 3 4")
        await addLiquidity(
            deployer,
            uniswap.tokens[3].address,
            uniswap.tokens[4].address,
            expandTo18Decimals(1_000_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        console.log("add 4 WETH")
        await addLiquidity(
            deployer,
            uniswap.weth9.address,
            uniswap.tokens[4].address,
            expandTo18Decimals(1_000),
            expandTo18Decimals(1_000_000),
            uniswap
        )

        // add pools
        let poolAddress = await uniswap.factory.getPool(uniswap.tokens[0].address, uniswap.tokens[1].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[0].address, uniswap.tokens[1].address, FeeAmount.MEDIUM, poolAddress)

        poolAddress = await uniswap.factory.getPool(uniswap.tokens[1].address, uniswap.tokens[2].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[1].address, uniswap.tokens[2].address, FeeAmount.MEDIUM, poolAddress)

        poolAddress = await uniswap.factory.getPool(uniswap.tokens[2].address, uniswap.tokens[3].address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[2].address, uniswap.tokens[3].address, FeeAmount.MEDIUM, poolAddress)

        poolAddress = await uniswap.factory.getPool(uniswap.tokens[3].address, uniswap.weth9.address, FeeAmount.MEDIUM)
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[2].address, uniswap.weth9.address, FeeAmount.MEDIUM, poolAddress)

        await feedProvider(deployer, accountFixture, uniswap, compound)
        await feedCompound(deployer, uniswap, compound)
        await feedCompoundETH(deployer, compound)


        accountAlice = await createMarginTradingAccount(alice, accountFixture)

        accountBob = await createMarginTradingAccount(bob, accountFixture)

        accountAchi = await createMarginTradingAccount(achi, accountFixture)

        accountGabi = await createMarginTradingAccount(gabi, accountFixture)

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

    it('allows open position multi exact in', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0
        const supplyIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0, 0], // action
            [1, 1, 1], // pid
            6 // flag
        )
        await uniswap.tokens[supplyIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const params = {
            path,
            amountOutMinimum: swapAmount.mul(99).div(100),
            amountIn: swapAmount,
        }

        const borrowPre = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)
        const supplyPre = await compound.cTokens[supplyIndex].balanceOf(accountAlice.address)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyIndex].address, supplyAmount)

        await accountAlice.connect(alice).openMarginPositionExactIn(params.amountIn, params.amountOutMinimum, params.path)

        const borrowPost = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAlice.address)
        const supplyPost = await compound.cTokens[supplyIndex].balanceOf(accountAlice.address)

        expect(borrowPost.sub(borrowPre).toString()).to.equal(swapAmount.toString())
        expectToBeLess(supplyPost.sub(supplyPre), swapAmount.add(supplyAmount))
        expectToBeLess(swapAmount.add(supplyAmount), supplyPost.sub(supplyPre), 0.98)
    })

    it('allows open position multi exact out', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0
        const supplyIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()

        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [4, 1, 1], // action
            [1, 1, 1], // pid
            6 // flag
        )
        await uniswap.tokens[supplyIndex].connect(bob).approve(accountBob.address, constants.MaxUint256)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(103).div(100)
        }

        const borrowPre = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountBob.address)
        const supplyPre = await compound.cTokens[supplyIndex].balanceOf(accountBob.address)

        const accountMM = await getMoneyMarketAccount(bob, accountBob.address)
        await accountMM.mint(uniswap.tokens[supplyIndex].address, supplyAmount)

        await accountBob.connect(bob).openMarginPositionExactOut(params.amountOut, params.amountInMaximum, params.path)

        const borrowPost = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountBob.address)
        const supplyPost = await compound.cTokens[supplyIndex].balanceOf(accountBob.address)

        expect(supplyPost.sub(supplyPre).toString()).to.equal(swapAmount.add(supplyAmount).toString())
        expectToBeLess(borrowPost.sub(borrowPre), swapAmount, 0.99)
        expectToBeLess(swapAmount, borrowPost.sub(borrowPre))
    })

    it('allows trim position multi exact in', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0
        const supplyIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [4, 1, 1], // action
            [1, 1, 1], // pid
            6 // flag
        )
        await uniswap.tokens[supplyIndex].connect(achi).approve(accountAchi.address, constants.MaxUint256)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(102).div(100),
        }

        const accountMM = await getMoneyMarketAccount(achi, accountAchi.address)
        await accountMM.mint(uniswap.tokens[supplyIndex].address, supplyAmount)

        await accountAchi.connect(achi).openMarginPositionExactOut(params.amountOut, params.amountInMaximum, params.path)


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const borrowPre = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAchi.address)
        const supplyPre = await compound.cTokens[supplyIndex].balanceOf(accountAchi.address)

        const pathTrim = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [7, 0, 0], // action
            [1, 1, 1], // pid
            7 // flag
        )

        const repayIn = expandTo18Decimals(90)
        const paramsTrim = {
            path: pathTrim,
            amountIn: repayIn,
            amountOutMinimum: repayIn.mul(99).div(100),
        }
        await accountAchi.connect(achi).trimMarginPositionExactIn(paramsTrim.amountIn, paramsTrim.amountOutMinimum, paramsTrim.path)

        const borrowPost = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAchi.address)
        const supplyPost = await compound.cTokens[supplyIndex].balanceOf(accountAchi.address)

        expect(supplyPre.sub(supplyPost).toString()).to.equal(repayIn.toString())
        expectToBeLess(repayIn, borrowPre.sub(borrowPost), 0.99)
        expectToBeLess(borrowPre.sub(borrowPost), repayIn)
    })

    it('allows trim margin multi swap exact out', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0
        const supplyIndex = 3

        const routeIndexes = [0, 1, 2, 3]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0, 0], // action
            [1, 1, 1], // pid
            6 // flag
        )
        await uniswap.tokens[supplyIndex].connect(gabi).approve(accountGabi.address, constants.MaxUint256)

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(98).div(100),
        }

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const accountMM = await getMoneyMarketAccount(gabi, accountGabi.address)
        await accountMM.mint(uniswap.tokens[supplyIndex].address, supplyAmount)

        await accountGabi.connect(gabi).openMarginPositionExactIn(params.amountIn, params.amountOutMinimum, params.path)

        const borrowPre = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountGabi.address)
        const supplyPre = await compound.cTokens[supplyIndex].balanceOf(accountGabi.address)

        const repayOut = expandTo18Decimals(90)

        const pathTrim = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3, 1, 1,], // action
            [1, 1, 1], // pid
            3 // flag
        )

        const paramsTrim = {
            path: pathTrim,
            amountOut: repayOut,
            amountInMaximum: repayOut.mul(101).div(100)
        }

        await accountGabi.connect(gabi).trimMarginPositionExactOut(paramsTrim.amountOut, paramsTrim.amountInMaximum, paramsTrim.path)

        const borrowPost = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountGabi.address)
        const supplyPost = await compound.cTokens[supplyIndex].balanceOf(accountGabi.address)

        expect(borrowPre.sub(borrowPost)).to.equal(repayOut.toString())
        expectToBeLess(repayOut, supplyPre.sub(supplyPost))
        expectToBeLess(supplyPre.sub(supplyPost), repayOut, 0.99)
    })

    it('allows open position from ETH multi exact in', async () => {
        const supplyAmount = expandTo18Decimals(1)
        const supplyIndex = 2

        const routeIndexes = [5, 4, 3, 2]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0, 0], // action
            [1, 1, 1], // pid
            6 // flag
        )
        await uniswap.tokens[supplyIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)

        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(99).div(100)
        }

        const borrowPre = await compound.cEther.callStatic.borrowBalanceCurrent(accountAlice.address)
        const supplyPre = await compound.cTokens[supplyIndex].balanceOf(accountAlice.address)

        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mint(uniswap.tokens[supplyIndex].address, supplyAmount)

        await accountAlice.connect(alice).openMarginPositionExactIn(params.amountIn, params.amountOutMinimum, params.path)

        const borrowPost = await compound.cEther.callStatic.borrowBalanceCurrent(accountAlice.address)
        const supplyPost = await compound.cTokens[supplyIndex].balanceOf(accountAlice.address)

        expect(borrowPost.sub(borrowPre).toString()).to.equal(swapAmount.toString())
        expectToBeLess(supplyPost.sub(supplyPre), swapAmount.add(supplyAmount))
        expectToBeLess(swapAmount.add(supplyAmount), supplyPost.sub(supplyPre), 0.98)
    })

    it('allows open position from ETH multi exact out', async () => {
        const supplyAmount = expandTo18Decimals(1)
        const supplyIndex = 2

        const routeIndexes = [5, 4, 3, 2]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [4, 1, 1], // action
            [1, 1, 1], // pid
            6 // flag
        )
        await uniswap.tokens[supplyIndex].connect(bob).approve(accountBob.address, constants.MaxUint256)

        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(102).div(100),
        }

        const borrowPre = await compound.cEther.callStatic.borrowBalanceCurrent(accountBob.address)
        const supplyPre = await compound.cTokens[supplyIndex].balanceOf(accountBob.address)

        const accountMM = await getMoneyMarketAccount(bob, accountBob.address)
        await accountMM.mint(uniswap.tokens[supplyIndex].address, supplyAmount)


        await accountBob.connect(bob).openMarginPositionExactOut(params.amountOut, params.amountInMaximum, params.path)

        const borrowPost = await compound.cEther.callStatic.borrowBalanceCurrent(accountBob.address)
        const supplyPost = await compound.cTokens[supplyIndex].balanceOf(accountBob.address)

        expect(supplyPost.sub(supplyPre).toString()).to.equal(swapAmount.add(supplyAmount).toString())
        expectToBeLess(borrowPost.sub(borrowPre), swapAmount, 0.98)
        expectToBeLess(swapAmount, borrowPost.sub(borrowPre), 1.001)
    })

    it('allows open position to ETH multi exact in', async () => {
        const supplyAmount = expandTo18Decimals(1)
        const borrowIndex = 2

        const routeIndexes = [2, 3, 4, 5]

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6, 0, 0,], // action
            [1, 1, 1], // pid
            6 // flag
        )
        const params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(99).div(100),
        }

        const borrowPre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountAlice.address)
        const supplyPre = await compound.cEther.balanceOf(accountAlice.address)


        const accountMM = await getMoneyMarketAccount(alice, accountAlice.address)
        await accountMM.mintEther({ value: supplyAmount })

        await accountAlice.connect(alice).openMarginPositionExactIn(params.amountIn, params.amountOutMinimum, params.path)

        const borrowPost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountAlice.address)
        const supplyPost = await compound.cEther.balanceOf(accountAlice.address)

        expect(borrowPost.sub(borrowPre).toString()).to.equal(swapAmount.toString())
        expectToBeLess(supplyPost.sub(supplyPre), swapAmount.add(supplyAmount))
        expectToBeLess(swapAmount.add(supplyAmount), supplyPost.sub(supplyPre), 0.98)
    })

    it('allows open position from ETH multi exact out', async () => {
        const supplyAmount = expandTo18Decimals(1)
        const borrowIndex = 2

        const routeIndexes = [2, 3, 4, 5]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [4, 1, 1], // action
            [1, 1, 1], // pid
            6 // flag
        )
        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(103).div(100),
        }

        const borrowPre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountBob.address)
        const supplyPre = await compound.cEther.balanceOf(accountBob.address)

        const accountMM = await getMoneyMarketAccount(bob, accountBob.address)
        await accountMM.mintEther({ value: supplyAmount })

        await accountBob.connect(bob).openMarginPositionExactOut(params.amountOut, params.amountInMaximum, params.path)

        const borrowPost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountBob.address)
        const supplyPost = await compound.cEther.balanceOf(accountBob.address)

        expect(supplyPost.sub(supplyPre).toString()).to.equal(swapAmount.add(supplyAmount).toString())
        expectToBeLess(borrowPost.sub(borrowPre), swapAmount, 0.98)
        expectToBeLess(swapAmount, borrowPost.sub(borrowPre), 1.001)
    })


    it('allows trim position from ETH multi exact in', async () => {
        const supplyAmount = expandTo18Decimals(1)
        const borrowIndex = 2

        const routeIndexes = [2, 3, 4, 5]

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [4, 1, 1], // action
            [1, 1, 1], // pid
            6 // flag
        )
        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(104).div(100),
        }

        await supplyToCompound(achi, accountAchi.address, 3, supplyAmount.mul(5), uniswap)

        await accountAchi.connect(achi).openMarginPositionExactOut(params.amountOut, params.amountInMaximum, params.path)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const borrowPre = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountAchi.address)
        const supplyPre = await compound.cEther.balanceOf(accountAchi.address)

        const pathTrim = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [7, 0, 0], // action
            [1, 1, 1], // pid
            7 // flag
        )

        const repayIn = expandTo18Decimals(1)
        const paramsTrim = {
            path: pathTrim,
            amountIn: repayIn,
            amountOutMinimum: repayIn.mul(99).div(100)
        }

        await accountAchi.connect(achi).trimMarginPositionExactIn(paramsTrim.amountIn, paramsTrim.amountOutMinimum, paramsTrim.path)

        const borrowPost = await compound.cTokens[borrowIndex].callStatic.borrowBalanceCurrent(accountAchi.address)
        const supplyPost = await compound.cEther.balanceOf(accountAchi.address)

        expect(supplyPre.sub(supplyPost).toString()).to.equal(repayIn.toString())
        expectToBeLess(repayIn, borrowPre.sub(borrowPost), 0.99)
        expectToBeLess(borrowPre.sub(borrowPost), repayIn)
    })

    it('allows trim position to ETH multi exact in', async () => {
        const supplyAmount = expandTo18Decimals(1)
        const borrowIndex = 5
        const supplyIndex = 2

        const routeIndexes = [5, 4, 3, 2]

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")


        const swapAmount = expandTo18Decimals(1)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        const path = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [4, 1, 1], // action
            [1, 1, 1], // pid
            6 // flag
        )
        const params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(103).div(100),
        }

        await uniswap.tokens[supplyIndex].connect(gabi).approve(accountGabi.address, constants.MaxUint256)
        await accountGabi.connect(gabi).openMarginPositionExactOut(params.amountOut, params.amountInMaximum, params.path)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const borrowPre = await compound.cEther.callStatic.borrowBalanceCurrent(accountGabi.address)
        const supplyPre = await compound.cTokens[supplyIndex].balanceOf(accountGabi.address)

        const pathTrim = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [7, 0, 0], // action
            [1, 1, 1], // pid
            7 // flag
        )
        const repayIn = expandTo18Decimals(1)
        const paramsTrim = {
            path: pathTrim,
            amountIn: repayIn,
            amountOutMinimum: repayIn.mul(99).div(100),
        }

        await accountGabi.connect(gabi).trimMarginPositionExactIn(paramsTrim.amountIn, paramsTrim.amountOutMinimum, paramsTrim.path)

        const borrowPost = await compound.cEther.callStatic.borrowBalanceCurrent(accountGabi.address)
        const supplyPost = await compound.cTokens[supplyIndex].balanceOf(accountGabi.address)

        expect(supplyPre.sub(supplyPost).toString()).to.equal(repayIn.toString())
        expectToBeLess(repayIn, borrowPre.sub(borrowPost), 0.99)
        expectToBeLess(borrowPre.sub(borrowPost), repayIn)
    })

    it('allows trim margin multi swap all out', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 4
        const supplyIndex = 0
        const swapInIndex = 1
        const routeIndexes = [1, 2, 3, 4]


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const accountGabiAlt = await createMarginTradingAccount(gabi, accountFixture, true)
        const borrowAmount = expandTo18Decimals(50)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await uniswap.tokens[supplyIndex].connect(gabi).approve(accountGabiAlt.address, constants.MaxUint256)
        await uniswap.tokens[swapInIndex].connect(gabi).approve(accountGabiAlt.address, constants.MaxUint256)
        await supplyToCompound(gabi, accountGabiAlt.address, swapInIndex, supplyAmount, uniswap)
        await supplyToCompound(gabi, accountGabiAlt.address, supplyIndex, supplyAmount, uniswap)
        await borrowFromCompound(gabi, accountGabiAlt.address, borrowTokenIndex, borrowAmount, uniswap)


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const supplyPre = await compound.cTokens[swapInIndex].balanceOf(accountGabiAlt.address)

        const pathTrim = encodeAggregatorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3, 1, 1,], // action
            [1, 1, 1], // pid
            3 // flag
        )
        const paramsTrim = {
            path: pathTrim,
            amountInMaximum: constants.MaxUint256
        }

        const absAccount = await getAbsoluteMarginTraderAccount(gabi, accountGabiAlt.address)

        await absAccount.connect(gabi).trimMarginPositionAllOut(paramsTrim.amountInMaximum, paramsTrim.path)

        const borrowPost = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountGabiAlt.address)
        const supplyPost = await compound.cTokens[swapInIndex].balanceOf(accountGabiAlt.address)

        expect(borrowPost.toString()).to.equal('0')
        expectToBeLess(supplyPre.sub(supplyPost), borrowAmount, 0.99)
        expectToBeLess(borrowAmount, supplyPre.sub(supplyPost))
    })


    it('allows trim position multi all in', async () => {
        const accountAchiAlt = await createMarginTradingAccount(achi, accountFixture, true)
        const supplyAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0
        const supplyIndex = 1
        const swapTokenIndex = 3
        const routeIndexes = [0, 1, 2, 3]
        const borrowAmount = expandTo18Decimals(110)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        await uniswap.tokens[supplyIndex].connect(achi).approve(accountAchiAlt.address, constants.MaxUint256)
        await uniswap.tokens[swapTokenIndex].connect(achi).approve(accountAchiAlt.address, constants.MaxUint256)
        await supplyToCompound(achi, accountAchiAlt.address, swapTokenIndex, supplyAmount, uniswap)
        await supplyToCompound(achi, accountAchiAlt.address, supplyIndex, supplyAmount, uniswap)
        await borrowFromCompound(achi, accountAchiAlt.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const borrowPre = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAchiAlt.address)
        const pathTrim = encodeAggregatorPathEthers(
            _tokensInRoute.reverse(),
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [7, 0, 0], // action
            [1, 1, 1], // pid
            7 // flag
        )


        const paramsTrim = {
            path: pathTrim,
            amountOutMinimum: borrowPre.mul(90).div(100)
        }

        const absAccount = await getAbsoluteMarginTraderAccount(gabi, accountAchiAlt.address)

        await absAccount.connect(achi).trimMarginPositionAllIn(paramsTrim.amountOutMinimum, paramsTrim.path)

        const borrowPost = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAchiAlt.address)
        const supplyPost = await compound.cTokens[swapTokenIndex].balanceOf(accountAchiAlt.address)

        expect(supplyPost.toString()).to.equal('0')
        expectToBeLess(supplyAmount, borrowPre.sub(borrowPost), 0.99)
        expectToBeLess(borrowPre.sub(borrowPost), supplyAmount)
    })

    it('function gatekeeper', async () => {
        const supplyAmount = expandTo18Decimals(100)
        const revertMessage = 'Only the account owner can interact.'
        const routeIndexes = [0, 1, 2, 3]
        const swapAmount = expandTo18Decimals(100)

        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))

        let params: any = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: swapAmount.mul(99).div(100)
        }


        await expect(
            accountAlice.connect(bob).openMarginPositionExactIn(params.amountIn, params.amountOutMinimum, params.path)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: swapAmount.mul(101).div(100)
        }

        await expect(
            accountBob.connect(achi).openMarginPositionExactOut(params.amountOut, params.amountInMaximum, params.path)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            amountIn: swapAmount,
            amountOutMinimum: constants.MaxUint256
        }
        await expect(
            accountAchi.connect(gabi).trimMarginPositionExactIn(params.amountIn, params.amountOutMinimum, params.path)
        ).to.be.revertedWith(revertMessage)
        const accountAchiAlt = await getAbsoluteMarginTraderAccount(achi, accountAchi.address)
        await expect(
            accountAchiAlt.connect(gabi).trimMarginPositionAllIn(params.amountOutMinimum, params.path)
        ).to.be.revertedWith(revertMessage)
        params = {
            path,
            amountOut: swapAmount,
            amountInMaximum: constants.MaxUint256
        }
        await expect(
            accountGabi.connect(achi).trimMarginPositionExactOut(params.amountOut, params.amountInMaximum, params.path)
        ).to.be.revertedWith(revertMessage)

        const accountGabiAlt = await getAbsoluteMarginTraderAccount(gabi, accountGabi.address)
        await expect(
            accountGabiAlt.connect(achi).trimMarginPositionAllOut(params.amountInMaximum, params.path)
        ).to.be.revertedWith(revertMessage)
    })

})

// ·------------------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                      Solc version: 0.8.21                                      ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ·································································································|···························|·················|······························
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  openMarginPositionExactIn           ·     663260  ·     776713  ·         729554  ·            4  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  openMarginPositionExactOut          ·     649567  ·     752560  ·         685643  ·            6  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  trimMarginPositionExactIn           ·     395904  ·     627485  ·         541606  ·            3  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  trimMarginPositionExactOut          ·          -  ·          -  ·         568420  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  trimMarginPositionAllIn             ·          -  ·          -  ·         631432  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  trimMarginPositionAllOut            ·          -  ·          -  ·         618324  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············

