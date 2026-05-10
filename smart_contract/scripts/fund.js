const hre = require("hardhat");

async function main() {
    const TO_ADDRESS = "0xFF57927EF69BA2fcC13011EdbC5B40cBB314f08A";
    
    // Lấy danh sách tài khoản của Hardhat Node (Account 0)
    const [deployer] = await hre.ethers.getSigners();
    
    console.log("Sending ETH from:", deployer.address);
    console.log("Sending ETH to:", TO_ADDRESS);

    // Gửi 100 ETH (Hardhat network)
    const tx = await deployer.sendTransaction({
        to: TO_ADDRESS,
        value: hre.ethers.parseEther("100.0") // 100 ETH
    });

    await tx.wait();
    console.log("Successfully sent 100 ETH to", TO_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });