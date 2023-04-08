const { network } = require("hardhat");
const { networkConfig, developmentChains } = require("../helper-hardhat-config");

// Some premium is required to makke requests to the contract on a anctual BC. This is in terms of LINK
const BASE_FEE = ethers.utils.parseEther("0.25");
// It is the amoun of link per gas used
//the contract has to pay gas to give us random numbers. This is ofset in terms of LINK
const GAS_PRICE_LINK = 1e9

module.exports = async ({ getNamedAccounts, deployments })=>{
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;
    if (developmentChains.includes(network.name)) {
        log("Local Network detected.Deploing mocks...");
        const vrfCoordinatorV2 = await deploy('VRFCoordinatorV2Mock', {
            from: deployer,
            args: [BASE_FEE, GAS_PRICE_LINK],
            log: true
        })
        log("Mocks deployed!");
        log("-----------------------------------------------");
    }
}

module.exports.tags = ["all","mocks"];