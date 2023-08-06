import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { constants } from 'ethers';
import { ethers, network } from 'hardhat'
import {
    SweeperModule,
    MarginTraderModule,
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
    supplyToCompound
} from './shared/accountFactoryFixture';
import { encodeAggregtorPathEthers } from './shared/aggregatorPath';
import { CompoundFixture, CompoundOptions, generateCompoundFixture } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { addLiquidity, uniswapFixture, UniswapFixture } from './shared/uniswapFixture';


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Account based single collateral and debt swap operations', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress;
    let uniswap: UniswapFixture
    let compound: CompoundFixture
    let opts: CompoundOptions
    let accountAlice: MarginTraderModule
    let absAccountAlice: SweeperModule
    let accountFixture: AccountFactoryFixture
    let tokenAddresses: string[]

    before('Deploy Account, Trader, Uniswap and Compound', async () => {
        [deployer, alice, bob, carol] = await ethers.getSigners();

        uniswap = await uniswapFixture(deployer, 5)

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

        accountFixture = await accountFactoryFixture(deployer, uniswap.factory, uniswap.weth9, compound.cEther.address)

        await accountFixture.dataProvider.addComptroller(compound.comptroller.address)
        await accountFixture.dataProvider.setNativeWrapper(uniswap.weth9.address)
        await accountFixture.dataProvider.setRouter(uniswap.router.address)

        await feedProvider(deployer, accountFixture, uniswap, compound)
        await feedCompound(deployer, uniswap, compound)
        tokenAddresses = [...uniswap.tokens.map(tk => tk.address), uniswap.weth9.address]

        await addLiquidity(
            deployer,
            uniswap.tokens[0].address,
            uniswap.tokens[1].address,
            expandTo18Decimals(1_0000_000),
            expandTo18Decimals(1_0000_000),
            uniswap
        )

        let poolAddress = await uniswap.factory.getPool(uniswap.tokens[0].address, uniswap.tokens[1].address, FeeAmount.MEDIUM)

        // add pool
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[0].address, uniswap.tokens[1].address, FeeAmount.MEDIUM, poolAddress)



        await addLiquidity(
            deployer, uniswap.tokens[0].address, uniswap.tokens[2].address, expandTo18Decimals(1_0000_000), expandTo18Decimals(1_0000_000),
            uniswap)
        poolAddress = await uniswap.factory.getPool(uniswap.tokens[2].address, uniswap.tokens[0].address, FeeAmount.MEDIUM)

        // add pool
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[0].address, uniswap.tokens[2].address, FeeAmount.MEDIUM, poolAddress)


        await addLiquidity(
            deployer,
            uniswap.tokens[1].address,
            uniswap.tokens[2].address,
            expandTo18Decimals(1_0000_000),
            expandTo18Decimals(1_0000_000),
            uniswap
        )

        poolAddress = await uniswap.factory.getPool(uniswap.tokens[1].address, uniswap.tokens[2].address, FeeAmount.MEDIUM)

        // add pool
        await accountFixture.dataProvider.addV3Pool(uniswap.tokens[1].address, uniswap.tokens[2].address, FeeAmount.MEDIUM, poolAddress)

    })

    it('allows loan swap borrow exact in', async () => {
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount_0 = expandTo18Decimals(100)
        const borrowTokenIndex_0 = 0

        const borrowAmount_1 = expandTo18Decimals(100)
        const borrowTokenIndex_1 = 2

        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex, supplyAmount, uniswap)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex_0, borrowAmount_0, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex_1, borrowAmount_1, uniswap)

        const swapAmount = expandTo18Decimals(50)

        const routeIndexes = [borrowTokenIndex_0, borrowTokenIndex_1]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [7], // action
            [0], // pid
            6 // flag
        )
        const params = {
            path,
            amountOutMinimum: swapAmount.mul(99).div(100),
            amountIn: swapAmount,
        }

        await accountAlice.connect(alice).swapBorrowExactIn(params.amountIn, params.amountOutMinimum, params.path)

        const borrow0 = await compound.cTokens[borrowTokenIndex_0].borrowBalanceStored(accountAlice.address)
        const borrow1 = await compound.cTokens[borrowTokenIndex_1].borrowBalanceStored(accountAlice.address)

        expect(borrow0.toString()).to.equal(borrowAmount_0.add(swapAmount).toString())
    })


    it('allows loan swap borrow exact out', async () => {
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount_0 = expandTo18Decimals(230)
        const borrowTokenIndex_0 = 0

        const borrowAmount_1 = expandTo18Decimals(230)
        const borrowTokenIndex_1 = 2

        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex, supplyAmount, uniswap)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex_0, borrowAmount_0, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex_1, borrowAmount_1, uniswap)

        const swapAmount = expandTo18Decimals(150)

        const routeIndexes = [borrowTokenIndex_0, borrowTokenIndex_1]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3], // action
            [0], // pid
            6 // flag
        )
        const params = {
            path,
            amountInMaximum: swapAmount.mul(101).div(100),
            amountOut: swapAmount,
        }

        await accountAlice.connect(alice).swapBorrowExactOut(params.amountOut, params.amountInMaximum, params.path)

        const borrow0 = await compound.cTokens[borrowTokenIndex_0].borrowBalanceStored(accountAlice.address)
        const borrow1 = await compound.cTokens[borrowTokenIndex_1].borrowBalanceStored(accountAlice.address)

        expect(borrow1.toString()).to.equal(borrowAmount_1.sub(swapAmount).toString())
    })

    it('allows collateral swap exact in', async () => {
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex_0 = 1
        const supplyTokenIndex_1 = 2
        const borrowAmount = expandTo18Decimals(400)
        const borrowTokenIndex = 0

        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex_0, supplyAmount, uniswap)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(900)

        const routeIndexes = [supplyTokenIndex_0, supplyTokenIndex_1]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6], // action
            [0], // pid
            5// flag
        )
        const params = {
            path,
            amountOutMinimum: swapAmount.mul(99).div(100),
            amountIn: swapAmount,
        }

        await accountAlice.connect(alice).swapCollateralExactIn(params.amountIn, params.amountOutMinimum, params.path)

        const supply0 = await compound.cTokens[supplyTokenIndex_0].balanceOf(accountAlice.address)
        expect(supply0.toString()).to.equal(supplyAmount.sub(swapAmount))
    })

    it('allows collateral swap exact out', async () => {
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex_0 = 1
        const supplyTokenIndex_1 = 2
        const borrowAmount = expandTo18Decimals(400)
        const borrowTokenIndex = 0

        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex_0, supplyAmount, uniswap)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const swapAmount = expandTo18Decimals(900)

        const routeIndexes = [supplyTokenIndex_0, supplyTokenIndex_1]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [4], // action
            [0], // pid
            3 // flag
        )
        const params = {
            path,
            amountInMaximum: swapAmount.mul(101).div(100),
            amountOut: swapAmount,
        }

        await accountAlice.connect(alice).swapCollateralExactOut(params.amountOut, params.amountInMaximum, params.path)

        const supply1 = await compound.cTokens[supplyTokenIndex_1].balanceOf(accountAlice.address)
        expect(supply1.toString()).to.equal(swapAmount)
    })

    it('allows collateral swap all in', async () => {
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex_0 = 1
        const supplyTokenIndex_1 = 2
        const borrowAmount = expandTo18Decimals(400)
        const borrowTokenIndex = 0

        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex_0, supplyAmount, uniswap)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        absAccountAlice = await getAbsoluteMarginTraderAccount(alice, accountAlice.address)



        const routeIndexes = [supplyTokenIndex_0, supplyTokenIndex_1]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t])
        // const path = encodePath(_tokensInRoute, new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [6], // action
            [0], // pid
            5// flag
        )
        const params = {
            path,
            amountOutMinimum: borrowAmount.mul(99).div(100),
        }


        await absAccountAlice.connect(alice).swapCollateralAllIn(params.amountOutMinimum, params.path)

        const bal = await compound.cTokens[supplyTokenIndex_1].callStatic.balanceOfUnderlying(accountAlice.address)
        const supply0 = await compound.cTokens[supplyTokenIndex_0].balanceOf(accountAlice.address)
        expect(supply0.toString()).to.equal('0')
        expect(bal.gte(supplyAmount.mul(99).div(100))).to.equal(true)
    })

    it('allows loan swap borrow all out', async () => {
        accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount_0 = expandTo18Decimals(250)
        const borrowTokenIndex_0 = 0

        const borrowAmount_1 = expandTo18Decimals(230)
        const borrowTokenIndex_1 = 2

        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex, supplyAmount, uniswap)

        // enter market
        await enterMarkets(alice, accountAlice.address, compound)

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex_0, borrowAmount_0, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex_1, borrowAmount_1, uniswap)

        absAccountAlice = await getAbsoluteMarginTraderAccount(alice, accountAlice.address)

        const routeIndexes = [borrowTokenIndex_0, borrowTokenIndex_1]
        let _tokensInRoute = routeIndexes.map(t => tokenAddresses[t]).reverse()
        // const path = encodePath(_tokensInRoute.reverse(), new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM))
        const path = encodeAggregtorPathEthers(
            _tokensInRoute,
            new Array(_tokensInRoute.length - 1).fill(FeeAmount.MEDIUM),
            [3], // action
            [0], // pid
            6 // flag
        )
        const params = {
            path,
            amountInMaximum: borrowAmount_1.mul(101).div(100),
        }
        await absAccountAlice.connect(alice).swapBorrowAllOut(params.amountInMaximum, params.path)

        const borrow0 = await compound.cTokens[borrowTokenIndex_0].callStatic.borrowBalanceCurrent(accountAlice.address)
        const borrow1 = await compound.cTokens[borrowTokenIndex_1].callStatic.borrowBalanceCurrent(accountAlice.address)

        expect(borrow1.toString()).to.equal('0')
        expect(borrow0.gt(borrowAmount_0.sub(borrowAmount_1))).to.equal(true)
    })


    // it('gatekeep swap functions', async () => {
    //     accountAlice = await createMarginTradingAccount(alice, accountFixture, true)
    //     const borrowTokenIndex_0 = 0
    //     const supplyTokenIndex_0 = 1
    //     const supplyTokenIndex_1 = 2
    //     const borrowTokenIndex_1 = 2
    //     const errorMessage = 'Only the account owner can interact.'
    //     const swapAmount = expandTo18Decimals(50)

    //     const params = {
    //         tokenIn: uniswap.tokens[borrowTokenIndex_0].address,
    //         tokenOut: uniswap.tokens[borrowTokenIndex_1].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountIn: swapAmount,
    //         amountOutMinimum: constants.MaxUint256,
    //     }

    //     await expect(
    //         accountAlice.connect(bob).swapBorrowExactIn(params)
    //     ).to.be.revertedWith(errorMessage)

    //     const paramSwapBorrowExactOut = {
    //         tokenIn: uniswap.tokens[borrowTokenIndex_0].address,
    //         tokenOut: uniswap.tokens[borrowTokenIndex_1].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountOut: swapAmount,
    //         amountInMaximum: constants.MaxUint256,
    //     }

    //     await expect(
    //         accountAlice.connect(bob).swapBorrowExactOut(paramSwapBorrowExactOut)
    //     ).to.be.revertedWith(errorMessage)

    //     const aliceAlt = await getAbsoluteMarginTraderAccount(alice, accountAlice.address)
    //     await expect(
    //         aliceAlt.connect(bob).swapBorrowAllOut(paramSwapBorrowExactOut)
    //     ).to.be.revertedWith(errorMessage)

    //     const paramsSwapCollateralExactIn = {
    //         tokenIn: uniswap.tokens[supplyTokenIndex_0].address,
    //         tokenOut: uniswap.tokens[supplyTokenIndex_1].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountIn: swapAmount,
    //         amountOutMinimum: constants.Zero,
    //     }

    //     await expect(
    //         accountAlice.connect(bob).swapCollateralExactIn(paramsSwapCollateralExactIn)
    //     ).to.be.revertedWith(errorMessage)

    //     await expect(
    //         aliceAlt.connect(bob).swapCollateralAllIn(paramsSwapCollateralExactIn)
    //     ).to.be.revertedWith(errorMessage)


    //     const paramsSwapCollateralExactOut = {
    //         tokenIn: uniswap.tokens[supplyTokenIndex_0].address,
    //         tokenOut: uniswap.tokens[supplyTokenIndex_1].address,
    //         fee: FeeAmount.MEDIUM,
    //         amountOut: swapAmount,
    //         amountInMaximum: constants.MaxUint256,
    //     }
    //     await expect(
    //         accountAlice.connect(bob).swapCollateralExactOut(paramsSwapCollateralExactOut)
    //     ).to.be.revertedWith(errorMessage)


    // })

})


// ·----------------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                     Solc version: 0.8.21                                     ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ·······························································································|···························|·················|······························
// |  Methods                                                                                     ·                 19 gwei/gas                 ·       1800.41 usd/eth       │
// ························································|······································|·············|·············|·················|···············|··············
// |  Contract                                             ·  Method                              ·  Min        ·  Max        ·  Avg            ·  # calls      ·  usd (avg)  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  swapBorrowExactIn                   ·          -  ·          -  ·         531754  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  swapBorrowExactOut                  ·          -  ·          -  ·         501320  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  swapCollateralExactIn               ·          -  ·          -  ·         561549  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  MarginTraderModule                                   ·  swapCollateralExactOut              ·          -  ·          -  ·         537785  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  swapBorrowAllOut                    ·          -  ·          -  ·         505688  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  swapCollateralAllIn                 ·          -  ·          -  ·         540596  ·            1  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············