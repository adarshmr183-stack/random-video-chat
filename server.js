const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));

let waitingUser = null;

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    if (waitingUser) {
        const partner = waitingUser;
        waitingUser = null;

        socket.partner = partner;
        partner.partner = socket;

        socket.emit("matched", { partnerId: partner.id });
        partner.emit("matched", { partnerId: socket.id });

        console.log("Users matched");
    } else {
        waitingUser = socket;
        socket.emit("waiting");

        console.log("User waiting");
    }

    socket.on("signal", ({ target, data }) => {
        io.to(target).emit("signal", {
            sender: socket.id,
            data
        });
    });

    socket.on("next", () => {
        disconnectPartner(socket);
        findPartner(socket);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        if (waitingUser === socket) {
            waitingUser = null;
        }

        disconnectPartner(socket);
    });
});

function findPartner(socket) {
    if (waitingUser && waitingUser !== socket) {
        const partner = waitingUser;
        waitingUser = null;

        socket.partner = partner;
        partner.partner = socket;

        socket.emit("matched", {
            partnerId: partner.id
        });

        partner.emit("matched", {
            partnerId: socket.id
        });

        console.log("Users matched");
    } else {
        waitingUser = socket;
        socket.emit("waiting");

        console.log("User waiting");
    }
}

function disconnectPartner(socket) {
    if (socket.partner) {
        const partner = socket.partner;

        socket.partner = null;

        if (partner.partner === socket) {
            partner.partner = null;
        }

        partner.emit("partnerDisconnected");
    }
}

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});