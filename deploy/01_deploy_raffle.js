
// we export deploy functions that are called by hardhat-deploy module

const { network } = require("hardhat");
const { developmentChains, networkConfig } = require("../helper-hardhat-config");
const { verify } = require("../utils/verify")

const VRF_SUB_FUND_AMT = ethers.utils.parseEther("30");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    let vrfCoordinatorV2Address, subscriptionId;
    const chainId = network.config.chainId;
    if (developmentChains.includes(network.name)) {
        const VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
        vrfCoordinatorV2Address = VRFCoordinatorV2Mock.address;
        const txnResponse = await VRFCoordinatorV2Mock.createSubscription();
        const txnReceipt = await txnResponse.wait(1);
        subscriptionId = txnReceipt.events[0].args.subId;
        await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMT);
    }
    else{
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
        subscriptionId = networkConfig[chainId]["subscriptionId"];
    }
    const gasLane = networkConfig[chainId]["gasLane"];
    const entranceFee = networkConfig[chainId]["entranceFee"];
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"];
    const interval = networkConfig[chainId]["interval"];
    const args = [vrfCoordinatorV2Address, entranceFee, gasLane, subscriptionId, callbackGasLimit, interval];
    console.log(args);
    const raffle = await deploy('Raffle', {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1
    })
    
    if (!developmentChains.includes(network.name) && process.env.API_KEY) {
        await verify(raffle.address, args);
    }
    log("-------------------------------------------------------");
}

module.exports.tags = ["all","raffle"];

