const { assert, expect } = require("chai");
const { network, getNamedAccounts, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config.js");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Test", function () {
        let raffle, VRFCoordinatorV2Mock, deployer, interval, accounts;
        const chainId = network.config.chainId;
        let raffleEntranceFee;

        beforeEach(async function () {
            deployer = (await getNamedAccounts()).deployer;
            await deployments.fixture(["all"]);//deploys all contracts.
            VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
            raffle = await ethers.getContract("Raffle", deployer);
            raffleEntranceFee = await raffle.getEntranceFee();
            interval = await raffle.getInterval();
            accounts = await ethers.getSigners();
        })

        describe("constructor", function () {
            it("Initializes the raffle correctly", async function () {
                // Ideally we have only one assert per it.
                const raffleState = await raffle.getRaffleState();
                assert.equal(raffleState.toString(), "0");
                assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
            })
        })

        describe("enter Raffle", function () {
            it("reverts when not enough ETH paid", async function () {
                await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughETHEntered");
            })
            it("records players on entry", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                const playerFromContract = await raffle.getPlayer(0);
                assert.equal(playerFromContract, deployer);
            })
            it("emits event on enter", async function () {
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(raffle, "raffleEnter");
            })
            it("doesnt allow entrance when raffle is calculating", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                /**
                 * Special testing on the hardhat blockchain... ==> See Hardhat Networks.
                 *     evm_increaseTime : increases time inside Blockchain
                 *     evm_mine : mines 1 block inside Blockchain
                 */
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await raffle.performUpkeep([])
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith("Raffle__NotOpen")
                // Had to install a previous version of chainlink :: npm install --save-dev @chainlink/contracts@0.4.1
            })
        });

        describe("checkUpkeep", function () {
            it("returns false if people haven't sent any ETH", async () => {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(!upkeepNeeded)
            })
            it("returns false if raffle isn't open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await raffle.performUpkeep([]) // changes the state to calculating
                const raffleState = await raffle.getRaffleState() // stores the new state
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert.equal(raffleState.toString() == "1", upkeepNeeded == false)
            })
            it("returns false if enough time hasn't passed", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(!upkeepNeeded)
            })
            it("returns true if enough time has passed, has players, eth, and is open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(upkeepNeeded)
            })
        })

        describe("performUpkeep", function () {
            it("it can only run if checkUpkeep is true", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const tx = await raffle.performUpkeep([])
                assert(tx)
            })
            it("reverts when checkUpkeep is false", async function () {
                await expect(raffle.performUpkeep([])).to.be.revertedWith("Raffle__UpKeepNotNeeded");
            })
            it("updates raffle state, emits an event and calls requestRandomWords", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const txResponse = await raffle.performUpkeep([])
                const txReciept = await txResponse.wait(1)
                const requestId = txReciept.events[1].args.requestId;
                // console.log(txReciept.events[0])
                const raffleState = await raffle.getRaffleState();
                assert(raffleState.toString() == "1")
                assert(requestId.toNumber() > 0)
            })
        })

        describe("FulfillRandomWords", function () {
            beforeEach(async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
            })

            it("can only be called after performUpkeep", async function () {
                await expect(VRFCoordinatorV2Mock.fulfillRandomWords(0/*random requestId*/, raffle.address)).to.be.revertedWith("nonexistent request")
            })

            it("picks a winner, resets the lottery and sends money", async function () {
                const additionalEntrants = 3;
                const startingIndex = 1;
                for (let i = startingIndex; i < startingIndex + additionalEntrants; i++) {
                    const accountConnectedRaffle = await raffle.connect(accounts[i]);
                    await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                }
                const startingTimestamp = await raffle.getLatestTimestamp()
                await new Promise(async (resolve,reject)=>{
                    raffle.once("WinnerPicked", async function(){
                        console.log("Winner Picked!");
                        try{
                            const recentWinner = await raffle.getRecentWinner();
                            // console.log(recentWinner)
                            // console.log(accounts[0].address)
                            // console.log(accounts[1].address)
                            // console.log(accounts[2].address)
                            const raffleState = await raffle.getRaffleState();
                            const endingTimestamp = await raffle.getLatestTimestamp();
                            const numPlayers = await raffle.getNumPlayers();
                            const winnerEndingBalance = await accounts[1].getBalance();
                            assert(endingTimestamp>startingTimestamp)
                            assert.equal(numPlayers.toString(),"0")
                            assert.equal(raffleState.toString(),"0")
                            assert.equal(winnerEndingBalance.toString(),winnerStartingBalance.add(raffleEntranceFee.mul(additionalEntrants).add(raffleEntranceFee)).toString())
                            resolve()
                        }
                        catch(e){
                            reject(e)
                        }
                    })
                    const tx = await raffle.performUpkeep([])
                    const txReciept = await tx.wait(1)
                    const winnerStartingBalance = await accounts[1].getBalance();
                    await VRFCoordinatorV2Mock.fulfillRandomWords(txReciept.events[1].args.requestId,raffle.address)
                })
            })
        })

        // describe("fulfillRandomWords", function () {
        //     it("works with Chainlink VRF and Keepers, gives us a random winner", async function () {
        //         const startingTimestamp = await raffle.getLatestTimestamp();
        //         await new Promise(async (resolve,reject)=>{
        //             raffle.once("WinnerPicked",async function(){
        //                 console.log("Winner Picked!!")
        //                 try{
        //                     const recentWinner = await raffle.getRecentWinner();
        //                     const raffleState = await raffle.getRaffleState();
        //                     const winnerEndingBalance = await accounts[0].getBalance();
        //                     const endingTimestamp = await raffle.getLatestTimestamp();
        //                     await expect(raffle.getPlayer(0)).to.be.reverted();
        //                     assert.equal(recentWinner.toString(),accounts[0].address);
        //                     assert.equal(raffleState.toString(),"0");
        //                     assert.equal(winnerEndingBalance.toString(),winnerStartingBalance.add(raffleEntranceFee).toString());
        //                     assert(endingTimestamp>startingTimestamp);
        //                     resolve()
        //                 }
        //                 catch(e){
        //                     reject(e)
        //                 }
        //             })
        //             await raffle.enterRaffle({ value: raffleEntranceFee })
        //             const winnerStartingBalance = await accounts[0].getBalance();
        //         })
        //     })
        // })

    });
