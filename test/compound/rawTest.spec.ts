import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, network } from 'hardhat'
import { expect } from './shared/expect'
import { CompoundFixture, generateCompoundFixture, ONE_18 } from './shared/fixtures'


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Compound Baseline Test Hardhat', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress;
    let compoundFixture: CompoundFixture


    before('get wallets and fixture', async () => {
        [deployer, alice, bob, carol] = await ethers.getSigners();
        const arr = [1, 2, 4, 5, 6]
        const options = {
            tokenCount: 5,
            collateralFactors: arr.map(x => ONE_18.mul(5).div(10)),
            exchangeRates: arr.map(x => ONE_18),
            borrowRates: arr.map(x => ONE_18),
            cEthExchangeRate: ONE_18,
            cEthBorrowRate: ONE_18,
            compRate: ONE_18,
            closeFactor: ONE_18
        }
        compoundFixture = await generateCompoundFixture(deployer, options)
    })

    it('deploys everything', async () => {
        await expect(
            compoundFixture.comptroller.address
        ).to.not.be.equal('')
    })

    it('allows collateral provision and redemption', async () => {
        const underlying = compoundFixture.underlyings[0]
        const cToken = compoundFixture.cTokens[0]
        const am = await underlying.totalSupply()
        await underlying.connect(deployer).transfer(alice.address, am.div(2))

        await underlying.connect(alice).approve(cToken.address, am)

        await cToken.connect(alice).mint(am.div(2))

        await cToken.connect(alice).redeemUnderlying(am.div(2))
    })

    it('allows borrow and repay', async () => {

        const borrow_underlying = compoundFixture.underlyings[0]
        const supply_underlying = compoundFixture.underlyings[1]

        const borrow_cToken = compoundFixture.cTokens[0]
        const supply_cToken = compoundFixture.cTokens[1]

        const comptroller = compoundFixture.comptroller

        // supplies
        const supply_am = await supply_underlying.totalSupply()
        const borrow_am = await borrow_underlying.totalSupply()

        // transfer supply amount to other acc
        await supply_underlying.connect(deployer).transfer(bob.address, supply_am.div(2))

        // supply amount to protocol for other acc to borrow
        await borrow_underlying.connect(deployer).approve(borrow_cToken.address, borrow_am)
        await borrow_cToken.connect(deployer).mint(borrow_am.div(2))

        // enter market
        await comptroller.connect(bob).enterMarkets(compoundFixture.cTokens.map(cT => cT.address))

        // user has to add collateral
        await supply_underlying.connect(bob).approve(supply_cToken.address, borrow_am)
        await supply_cToken.connect(bob).mint(borrow_am.div(2))

        // other account borrows amount
        await borrow_cToken.connect(bob).borrow(borrow_am.div(4))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        // repay amount
        await borrow_underlying.connect(bob).approve(borrow_cToken.address, borrow_am.div(4))
        await borrow_cToken.connect(bob).repayBorrow(borrow_am.div(4))
    })




    //    
})
