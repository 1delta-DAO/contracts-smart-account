import { ethers } from "hardhat"

export type AddressDictionary = { [prop: string]: { [chainId: number]: string } }

export const isZero = (address?: string): boolean => {
    if (!address) return true
    return address === ethers.constants.AddressZero
}

export const validateAddresses = (addresses: any[]) => {
    for (let i = 0; i < addresses.length; i++) {
        if (isZero(addresses[i])) throw new Error('Addresses incomplete')
    }
}