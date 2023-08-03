import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { constants } from 'ethers';
import { ethers, network } from 'hardhat'
import { MoneyMarketModule } from '../../types';
import { expandTo18Decimals } from '../uniswap-v3/periphery/shared/expandTo18Decimals';
import {
    accountFactoryFixture,
    AccountFactoryFixture,
    borrowFromCompound,
    createMoneyMarketAccount,
    feedProvider,
    redeemUnderlyingFromCompound,
    supplyToCompound,
    repayBorrowToCompound,
    getOperatorContract,
    feedCompound,
    getMoneyMarketAccount
} from './shared/accountFactoryFixture';
import { CompoundFixture, CompoundOptions, generateCompoundFixture } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { uniswapFixture, UniswapFixture } from './shared/uniswapFixture';


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Account based single money market interactions', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress;
    let uniswap: UniswapFixture
    let compound: CompoundFixture
    let opts: CompoundOptions
    let accountAlice: MoneyMarketModule
    let accountFixture: AccountFactoryFixture

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
    })

    it('deploys account', async () => {
        await accountFixture.diamondDeployer.connect(alice).createAccount("aliceTest", false)
    })

    it('allows approving underlyings', async () => {
        const proxyDeployer = accountFixture.diamondDeployer

        await proxyDeployer.connect(alice).createAccount("aliceTest", false)
        const accounts = await proxyDeployer.getAccounts(alice.address)
        const acccountContract = await getOperatorContract(accounts[0])
        await acccountContract.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
    })

    it('approval and enter on creation', async () => {
        const proxyDeployer = accountFixture.diamondDeployer

        await proxyDeployer.connect(carol).createAccount("carolTest", true)
        const accounts = await proxyDeployer.getAccounts(carol.address)
        const acccountContract = await getOperatorContract(accounts[0])
        await acccountContract.connect(carol).approveUnderlyings(uniswap.tokens.map(t => t.address))
    })

    it('allows mint', async () => {
        accountAlice = await createMoneyMarketAccount(alice, accountFixture)

        const amount = expandTo18Decimals(1_000)
        const tokenIndex = 1
        await accountAlice.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await supplyToCompound(alice, accountAlice.address, tokenIndex, amount, uniswap)

        const bal = await compound.cTokens[tokenIndex].balanceOf(accountAlice.address)
        expect(bal.toString()).to.equal(amount.toString())
    })

    it('allows redeem', async () => {
        accountAlice = await createMoneyMarketAccount(alice, accountFixture)

        const amount = expandTo18Decimals(1_000)
        const tokenIndex = 1
        const balPre = await compound.cTokens[tokenIndex].balanceOf(accountAlice.address)

        await accountAlice.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await supplyToCompound(alice, accountAlice.address, tokenIndex, amount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await redeemUnderlyingFromCompound(alice, accountAlice.address, tokenIndex, amount, uniswap)

        const balPost = await compound.cTokens[tokenIndex].balanceOf(accountAlice.address)
        expect(balPost.toString()).to.equal(balPre.toString())
    })

    it('allows borrow', async () => {
        accountAlice = await createMoneyMarketAccount(alice, accountFixture)

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0

        await accountAlice.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex, supplyAmount, uniswap)

        // enter market
        await accountAlice.connect(alice).enterMarkets(compound.cTokens.map(cT => cT.address))

        // fetch balance
        const borrowedBefore = await uniswap.tokens[borrowTokenIndex].balanceOf(alice.address)

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex, borrowAmount, uniswap)

        // fetch balance
        const borrowed = await uniswap.tokens[borrowTokenIndex].balanceOf(alice.address)

        // check whether borrowed amount was received
        expect(borrowed.sub(borrowedBefore).toString()).to.equal(borrowAmount.toString())

    })

    it('allows repay borrow', async () => {
        accountAlice = await createMoneyMarketAccount(alice, accountFixture)

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0

        await accountAlice.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await supplyToCompound(alice, accountAlice.address, supplyTokenIndex, supplyAmount, uniswap)

        await accountAlice.connect(alice).enterMarkets(compound.cTokens.map(cT => cT.address))

        await borrowFromCompound(alice, accountAlice.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await uniswap.tokens[borrowTokenIndex].connect(alice).approve(accountAlice.address, constants.MaxUint256)
        await repayBorrowToCompound(alice, accountAlice.address, borrowTokenIndex, borrowAmount, uniswap)
    })


    it('allows repay borrow on full init', async () => {

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0

        const accountAliceNew = await createMoneyMarketAccount(alice, accountFixture, true)

        await uniswap.tokens[supplyTokenIndex].approve(accountAliceNew.address, ethers.constants.MaxUint256)
        await supplyToCompound(alice, accountAliceNew.address, supplyTokenIndex, supplyAmount, uniswap)

        await borrowFromCompound(alice, accountAliceNew.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")
        await uniswap.tokens[borrowTokenIndex].connect(alice).approve(accountAliceNew.address, constants.MaxUint256)
        await repayBorrowToCompound(alice, accountAliceNew.address, borrowTokenIndex, borrowAmount, uniswap)
    })

    it('allows redeem cToken', async () => {
        accountAlice = await createMoneyMarketAccount(alice, accountFixture)

        const amount = expandTo18Decimals(1_000)
        const tokenIndex = 1

        await accountAlice.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await supplyToCompound(alice, accountAlice.address, tokenIndex, amount, uniswap)

        const cTokenBalance = await compound.cTokens[tokenIndex].balanceOf(accountAlice.address)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const mmAccount = await getMoneyMarketAccount(alice, accountAlice.address)

        await mmAccount.redeem(uniswap.tokens[tokenIndex].address, alice.address, cTokenBalance)

        const cTokenBalanceAfter = await compound.cTokens[tokenIndex].balanceOf(accountAlice.address)

        const balPost = await compound.cTokens[tokenIndex].balanceOf(accountAlice.address)
        expect(balPost.toString()).to.equal('0')
        expect(cTokenBalanceAfter.toString()).to.equal('0')
    })

    it('allows redeem all underlying', async () => {
        accountAlice = await createMoneyMarketAccount(alice, accountFixture)

        const amount = expandTo18Decimals(1_000)
        const tokenIndex = 1

        await accountAlice.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await supplyToCompound(alice, accountAlice.address, tokenIndex, amount, uniswap)


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const mmAccount = await getMoneyMarketAccount(alice, accountAlice.address)

        await mmAccount.redeemAll(uniswap.tokens[tokenIndex].address, alice.address)

        const cTokenBalanceAfter = await compound.cTokens[tokenIndex].balanceOf(accountAlice.address)

        const balPost = await compound.cTokens[tokenIndex].balanceOf(accountAlice.address)
        expect(balPost.toString()).to.equal('0')
        expect(cTokenBalanceAfter.toString()).to.equal('0')
    })


    it('allows redeem all underlying Ether', async () => {
        accountAlice = await createMoneyMarketAccount(alice, accountFixture)

        const amount = expandTo18Decimals(1_000)
        const tokenIndex = 1

        await accountAlice.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await accountAlice.connect(alice).mintEther({ value: amount })
        await supplyToCompound(alice, accountAlice.address, tokenIndex, amount, uniswap)


        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const mmAccount = await getMoneyMarketAccount(alice, accountAlice.address)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")
        await mmAccount.redeemAllEther(alice.address)
        const cTokenBalanceAfter = await compound.cEther.balanceOf(accountAlice.address)

        const balPost = await compound.cEther.balanceOf(accountAlice.address)
        expect(balPost.toString()).to.equal('0')
        expect(cTokenBalanceAfter.toString()).to.equal('0')
    })


    it('allows redeem all underlying Ether from wrapped', async () => {
        accountAlice = await createMoneyMarketAccount(alice, accountFixture)
        const amount = expandTo18Decimals(1_000)
        const tokenIndex = 1

        await accountAlice.connect(alice).approveUnderlyings(uniswap.tokens.map(t => t.address))
        await accountAlice.connect(alice).mintEther({ value: amount })
        await supplyToCompound(alice, accountAlice.address, tokenIndex, amount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        const balPre = await compound.cEther.callStatic.borrowBalanceCurrent(accountAlice.address)
        const mmAccount = await getMoneyMarketAccount(alice, accountAlice.address)
        await mmAccount.redeemAllEtherAndWrap(alice.address)
        const cTokenBalanceAfter = await compound.cEther.balanceOf(accountAlice.address)
        const wethPost = await uniswap.weth9.connect(alice).balanceOf(alice.address)
        const balPost = await compound.cEther.callStatic.borrowBalanceCurrent(accountAlice.address)
        expect(balPost.toString()).to.equal('0')
        expect(wethPost.gte(balPre)).to.equal(true)
        expect(cTokenBalanceAfter.toString()).to.equal('0')
    })


    it('allows repay full borrow no dust', async () => {

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount = expandTo18Decimals(100)
        const borrowTokenIndex = 0

        const accountAliceNew = await createMoneyMarketAccount(alice, accountFixture, true)

        await uniswap.tokens[supplyTokenIndex].approve(accountAliceNew.address, ethers.constants.MaxUint256)
        await supplyToCompound(alice, accountAliceNew.address, supplyTokenIndex, supplyAmount, uniswap)

        await borrowFromCompound(alice, accountAliceNew.address, borrowTokenIndex, borrowAmount, uniswap)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")
        await uniswap.tokens[borrowTokenIndex].connect(alice).approve(accountAliceNew.address, constants.MaxUint256)
        await accountAliceNew.connect(alice).repayBorrowAll(uniswap.tokens[borrowTokenIndex].address)

        const newBal = await compound.cTokens[borrowTokenIndex].callStatic.borrowBalanceCurrent(accountAliceNew.address)
        expect(newBal.toString()).to.equal('0')
    })

    it('allows repay full borrow Ether no dust', async () => {

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount = expandTo18Decimals(100)

        const accountAliceNew = await createMoneyMarketAccount(alice, accountFixture, true)

        await uniswap.tokens[supplyTokenIndex].approve(accountAliceNew.address, ethers.constants.MaxUint256)
        await supplyToCompound(alice, accountAliceNew.address, supplyTokenIndex, supplyAmount, uniswap)

        await accountAliceNew.connect(alice).borrowEther(alice.address, borrowAmount)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")
        await accountAliceNew.connect(alice).repayBorrowAllEther({ value: borrowAmount.mul(101).div(100) })

        const newBal = await compound.cEther.callStatic.borrowBalanceCurrent(accountAliceNew.address)
        expect(newBal.toString()).to.equal('0')
    })

    it('allows repay full borrow Ether from WETH no dust', async () => {

        const supplyAmount = expandTo18Decimals(1_000)
        const supplyTokenIndex = 1
        const borrowAmount = expandTo18Decimals(100)
        const accountAliceNew = await createMoneyMarketAccount(alice, accountFixture, true)

        await uniswap.tokens[supplyTokenIndex].approve(accountAliceNew.address, ethers.constants.MaxUint256)
        await supplyToCompound(alice, accountAliceNew.address, supplyTokenIndex, supplyAmount, uniswap)

        await accountAliceNew.connect(alice).borrowEther(alice.address, borrowAmount)

        await uniswap.weth9.connect(alice).deposit({ value: borrowAmount.mul(105).div(100) })
        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")
        await uniswap.weth9.connect(alice).approve(accountAliceNew.address, constants.MaxUint256)
        await accountAliceNew.connect(alice).unwrapAndRepayBorrowAllEther()

        const newBal = await compound.cEther.callStatic.borrowBalanceCurrent(accountAliceNew.address)
        expect(newBal.toString()).to.equal('0')
    })


    it('gatekeep functions', async () => {

        const underlying = uniswap.tokens[0].address
        const supplyAmount = expandTo18Decimals(1_000)
        const revertMessage = 'Only the account owner can interact.'
        const accountAlice = await createMoneyMarketAccount(alice, accountFixture, true)

        await expect(
            accountAlice.connect(bob).borrow(underlying, bob.address, supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).mint(underlying, supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).mintEther()
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).unwrapAndMintEther(supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).redeem(underlying, bob.address, supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).redeemUnderlying(underlying, bob.address, supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).redeemAll(underlying, bob.address)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).redeemCEther(carol.address, 9)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).redeemCEtherAndWrap(bob.address, supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).redeemUnderlyingEther(bob.address, supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).redeemAllEther(bob.address)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).redeemAllEtherAndWrap(bob.address)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).repayBorrow(underlying, supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).repayBorrowAll(underlying)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).repayBorrowEther()
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).repayBorrowAllEther()
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).unwrapAndRepayBorrowEther(supplyAmount)
        ).to.be.revertedWith(revertMessage)

        await expect(
            accountAlice.connect(bob).unwrapAndRepayBorrowAllEther()
        ).to.be.revertedWith(revertMessage)
    })

})


// ·-------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                Solc version: 0.8.21                                 ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ······················································································|···························|·················|······························
// |  Methods                                                                                                                                                        │
// ························································|·····························|·············|·············|·················|···············|··············
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  approveUnderlyings            ·     286291  ·     485291  ·         465391  ·           10  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  borrow                        ·     395744  ·     427325  ·         415810  ·            4  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  borrowEther                   ·          -  ·          -  ·         436459  ·            2  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  enterMarkets                  ·          -  ·          -  ·         325361  ·            2  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  mint                          ·          -  ·          -  ·         179147  ·           12  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  mintEther                     ·          -  ·          -  ·         150438  ·            2  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  redeem                        ·          -  ·          -  ·         137241  ·            1  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  redeemUnderlying              ·          -  ·          -  ·         135635  ·            1  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  MoneyMarketModule                                    ·  repayBorrow                   ·          -  ·          -  ·         132255  ·            2  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  redeemAll                     ·          -  ·          -  ·         139593  ·            1  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  redeemAllEther                ·          -  ·          -  ·         123605  ·            1  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  redeemAllEtherAndWrap         ·          -  ·          -  ·         155841  ·            1  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  repayBorrowAll                ·          -  ·          -  ·         136589  ·            1  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  repayBorrowAllEther           ·          -  ·          -  ·         115206  ·            1  ·          -  │
// ························································|································|·············|·············|·················|···············|··············
// |  SweeperModule                                        ·  unwrapAndRepayBorrowAllEther  ·          -  ·          -  ·         134457  ·            1  ·          -  │
// ························································|································|·············|·············|·················|···············|··············


