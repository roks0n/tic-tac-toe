"use strict";
var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var _ = require('underscore');

server.listen(8000);

var players = [];
var game;
var winningComb = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

function removePlayerById(id) {
    _.each(players, function (player, index) {
        if (player && player.id === id) {
            players.splice(index, 1);
        }
    });
}

function alertUser(playerId, msg) {
    io.sockets.connected['/#' + playerId].emit('alert', { 'msg': msg });
}

function alertAll(msg) {
    io.sockets.emit('alert', msg);
}

var Player = function (id, nickname) {
    this.id = id;
    this.nickname = nickname || undefined;
    this.points = 0;
}

var Game = function (player1, player2) {
    this.players = [player1, player2];
    this.turn = 0;  // which players turn it is
    this.board = new Array();

    // create starter board
    for (let i = 0; i < 9; i++) {
        this.board.push(-1);
    }

    this.move = function (playerId, move) {
        if (this.players[this.turn % 2].id === playerId) {
            if (this.board[move - 1] === -1) {
                this.board[move - 1] = this.turn % 2;
                // send updates about the move to both users
                io.emit('move', {
                    'player': this.turn % 2 === 0 ? 'x' : 'o',
                    'field': move
                });
                this.turn++;
                return true;
            } else {
                alertUser(playerId, 'This field has already been overtaken by an oposing \
                                         player. Choose a different field.');
                return false;
            }
        } else {
            alertUser(playerId, "It's not your turn! Wait for the other player to make a move.");
            return false;
        }
    };

    this.checkWinner = function (playerId) {
        for (let i = 0; i < winningComb.length; i++) {
            if (this.board[winningComb[i][0]] === (this.turn + 1) % 2 &&
                this.board[winningComb[i][1]] === (this.turn + 1) % 2 &&
                this.board[winningComb[i][2]] === (this.turn + 1) % 2)
            {
                let player = this.players[(this.turn + 1) % 2];
                alertAll({
                    'msg': 'Player ' +  player.id + ' won the game! Press OK to start a new game.',
                    'refresh': true
                });
                player.score++;
                return true;
            }
        }
        return false;
    }

    this.hasEnded = function () {
        if (!_.contains(this.board, -1)) {
            alertAll({
                    'msg': 'Game over. Press OK to start a new game.',
                    'refresh': true
                });
            return true;
        }
        return false;
    }

}

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
    // on player disconnect
    socket.on('disconnect', function (data) {
        removePlayerById(socket.client.id)
    });

    // on player move
    socket.on('move', function (data) {
        if (game.move(socket.client.id, data.field)) {
            socket.emit('move', {
                'player': socket.client.id,
                'field': data.field
            });

            if (game.checkWinner(socket.client.id) || game.hasEnded()) {
                game = undefined;
            }

        }
    });

    if (players.length > 1) {
        socket.emit('status', {
            'msg': '2 players already playing. You have entered the game as an observer.'
        });
    } else {
        players.push(new Player(socket.client.id));
    }

    if (players.length === 1) {
        socket.emit('status', { 'msg': 'Waiting for one more player to join.' });
    }

    if (players.length === 2) {
        game = new Game(players[0], players[1]);
        io.sockets.emit('status', { 'msg': 'Let the games begin!'});
    }
});
