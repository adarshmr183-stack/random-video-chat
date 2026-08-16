const socket = io();

const startBtn = document.getElementById("startBtn");
const nextBtn = document.getElementById("nextBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statusText = document.getElementById("status");

let localStream = null;
let peerConnection = null;
let partnerId = null;

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

startBtn.addEventListener("click", start);

nextBtn.addEventListener("click", () => {
    cleanupConnection();
    socket.emit("next");
    statusText.textContent = "Finding another person...";
});

disconnectBtn.addEventListener("click", () => {
    cleanupConnection();

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    localVideo.srcObject = null;

    startBtn.disabled = false;
    nextBtn.disabled = true;
    disconnectBtn.disabled = true;
    muteBtn.disabled = true;
    cameraBtn.disabled = true;

    muteBtn.textContent = "Mute";
    cameraBtn.textContent = "Camera Off";

    statusText.textContent = "Disconnected. Click Start to begin again.";
});

muteBtn.addEventListener("click", () => {
    if (!localStream) return;

    const audioTrack = localStream.getAudioTracks()[0];

    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        muteBtn.textContent = audioTrack.enabled ? "Mute" : "Unmute";
    }
});

cameraBtn.addEventListener("click", () => {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];

    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        cameraBtn.textContent = videoTrack.enabled
            ? "Camera Off"
            : "Camera On";
    }
});

async function start() {
    try {
        statusText.textContent = "Requesting camera and microphone...";

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        startBtn.disabled = true;
        muteBtn.disabled = false;
        cameraBtn.disabled = false;

        statusText.textContent = "Looking for a stranger...";

        socket.connect();

    } catch (error) {
        console.error(error);

        statusText.textContent =
            "Camera/microphone permission was denied.";
    }
}

socket.on("waiting", () => {
    statusText.textContent =
        "Waiting for a stranger...";
});

socket.on("matched", async ({ partnerId: id }) => {
    partnerId = id;

    statusText.textContent =
        "Stranger found! Connecting...";

    nextBtn.disabled = false;
    disconnectBtn.disabled = false;

    createPeerConnection();

    if (socket.id < partnerId) {
        const offer = await peerConnection.createOffer();

        await peerConnection.setLocalDescription(offer);

        socket.emit("signal", {
            target: partnerId,
            data: {
                type: "offer",
                offer
            }
        });
    }
});

socket.on("signal", async ({ sender, data }) => {
    if (!peerConnection) {
        createPeerConnection();
    }

    partnerId = sender;

    if (data.type === "offer") {
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.offer)
        );

        const answer = await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(answer);

        socket.emit("signal", {
            target: sender,
            data: {
                type: "answer",
                answer
            }
        });
    }

    if (data.type === "answer") {
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.answer)
        );
    }

    if (data.type === "candidate") {
        try {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(data.candidate)
            );
        } catch (error) {
            console.error("ICE candidate error:", error);
        }
    }
});

socket.on("partnerDisconnected", () => {
    cleanupConnection();

    statusText.textContent =
        "The stranger disconnected. Finding someone else...";

    socket.emit("next");
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];

        statusText.textContent =
            "Connected! You are chatting with a stranger.";
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate && partnerId) {
            socket.emit("signal", {
                target: partnerId,
                data: {
                    type: "candidate",
                    candidate: event.candidate
                }
            });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log(
            "Connection state:",
            peerConnection.connectionState
        );
    };
}

function cleanupConnection() {
    if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.close();
        peerConnection = null;
    }

    remoteVideo.srcObject = null;
    partnerId = null;
}
