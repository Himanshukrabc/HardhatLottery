// 1. Get our SubId for Chainlink VRF & Fund
// 2. Deploy our contract using the SubId
// 3. Register the contract with Chainlink VRF & it's subid
// 4. Register the contract with Chainlink Keepers
// 5. Run staging tests

const { assert, expect } = require("chai");
const { network, getNamedAccounts, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config.js");

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Test", function () {
        let raffle, deployer;

        beforeEach(async function () {
            deployer = (await getNamedAccounts()).deployer;
            raffle = await ethers.getContract("Raffle", deployer);
            raffleEntranceFee = await raffle.getEntranceFee();
        })

        describe("fulfillRandomWords", function () {
            it("works with Chainlink VRF and Keepers, gives us a random winner", async function () {
                const startingTimestamp = await raffle.getLatestTimestamp();
                await new Promise(async (resolve,reject)=>{
                  const accounts = await ethers.getSigners()
                  raffle.once("WinnerPicked",async function(){
                        console.log("Winner Picked!!")
                        try{
                            const recentWinner = await raffle.getRecentWinner();
                            const raffleState = await raffle.getRaffleState();
                            const winnerEndingBalance = await accounts[0].getBalance();
                            const endingTimestamp = await raffle.getLatestTimestamp();
                            await expect(raffle.getPlayer(0)).to.be.reverted;
                            assert.equal(recentWinner.toString(),accounts[0].address);
                            assert.equal(raffleState.toString(),"0");
                            // assert.equal(winnerEndingBalance.toString(),winnerStartingBalance.add(raffleEntranceFee).toString());
                            assert(endingTimestamp>startingTimestamp);
                            resolve()
                        }
                        catch(e){
                            reject(e)
                        }
                    })
                    await raffle.enterRaffle({ value: raffleEntranceFee })
                    const winnerStartingBalance = await accounts[0].getBalance();
                })
            })
        })

    })