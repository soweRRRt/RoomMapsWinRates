const axios = require('axios');

const API_KEY = 'ce5c7213-e7b0-4aa4-b94f-56651e4e4e4a';
const PLAYER_ID = '6d37cfda-9396-449f-aa26-a66bb65d40cf'; // trymore
// const PLAYER_ID = '94689f53-1af3-4380-8f77-c8227dd6609f'; // ForTeens01
// const PLAYER_ID = 'c1b04e49-c263-4a43-b442-2b9322977a7c'; // soweRt


const playerCache = {};
const Bottleneck = require('bottleneck');

const limiter = new Bottleneck({
    maxConcurrent: 15,
    minTime: 200
});

async function getPlayerInfo(playerId) {
    if (playerCache[playerId]) {
        return playerCache[playerId];
    }

    try {
        const response = await limiter.schedule(() => axios.get(`https://open.faceit.com/data/v4/players/${playerId}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        }));
        playerCache[playerId] = response.data;
        return response.data;
    } catch (error) {
        console.error('Ошибка при получении информации о игроке:', error.message);
        return null;
    }
}

async function scrapeData() {
    try {
        const friends = await getPlayerInfo(PLAYER_ID);
        const friendIds = new Set(friends.friends_ids);

        const matchesResponse = await axios.get(`https://open.faceit.com/data/v4/players/${PLAYER_ID}/history`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            },
            params: {
                game: 'cs2',
                offset: 0,
                limit: 100 // maximum
            }
        });

        const matches = matchesResponse.data.items;
        // console.log(matches.length);
        const playerStats = {};

        for (const match of matches) {
            const matchId = match.match_id;

            const matchDetailsResponse = await limiter.schedule(() => axios.get(`https://open.faceit.com/data/v4/matches/${matchId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            }));

            const matchDetails = matchDetailsResponse.data;
            const players = matchDetails.teams;

            let playerTeam, playerTeamString;
            if (players.faction1.roster.some(player => player.player_id === PLAYER_ID)) {
                playerTeam = players.faction1.roster.filter(player => player.player_id !== PLAYER_ID);
                playerTeamString = 'faction1';
            } else {
                playerTeam = players.faction2.roster.filter(player => player.player_id !== PLAYER_ID);
                playerTeamString = 'faction2';
            }

            const filteredPlayerTeam = [playerTeam.filter(player => friendIds.has(player.player_id))];
            // const playerCombinations = generateCombinations(filteredPlayerTeam);
            // console.log(filteredPlayerTeam);
            // console.log(playerCombinations);
            // console.log('==========================');

            const myPlayer = players.faction1.roster.find(player => player.player_id === PLAYER_ID) ||
                players.faction2.roster.find(player => player.player_id === PLAYER_ID);

            // const allCombinations = filteredPlayerTeam.map(combination => {
            //     const sortedCombination = combination.map(player => player.nickname).sort();
            //     return [myPlayer, ...sortedCombination].join(" + ");
            // });

            const allCombinationsPromises = filteredPlayerTeam.map(async combination => {
                const currentNicknames = await Promise.all(combination.map(async player => {
                    const playerInfo = await getPlayerInfo(player.player_id);
                    // console.log(playerInfo);
                    return playerInfo ? playerInfo.nickname : null;
                }));

                const sortedCombination = currentNicknames.filter(nickname => nickname !== null).sort();
                const myPlayerNow = await getPlayerInfo(myPlayer.player_id);
                return [myPlayerNow.nickname, ...sortedCombination].join(" + ");
            });

            const allCombinations = await Promise.all(allCombinationsPromises);


            for (const combination of allCombinations) {
                if (!playerStats[combination]) {
                    playerStats[combination] = { totalMatches: 0, totalWins: 0, totalLoses: 0 };
                }

                playerStats[combination].totalMatches++;

                if (matchDetails.results.winner === playerTeamString) {
                    playerStats[combination].totalWins++;
                } else {
                    playerStats[combination].totalLoses++;
                }
            }
        }

        const sortedStats = Object.entries(playerStats).map(([combination, stats]) => ({
            combination,
            totalMatches: stats.totalMatches,
            totalWins: stats.totalWins,
            totalLoses: stats.totalLoses,
            winRate: Math.round((stats.totalWins / stats.totalMatches) * 100) || 0
        }));

        sortedStats.sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            if (b.totalMatches !== a.totalMatches) return b.totalMatches - a.totalMatches;
            return b.combination.length - a.combination.length;
        });

        console.log('Статистика по комбинациям игроков:');
        for (const { combination, totalMatches, totalWins, winRate, totalLoses } of sortedStats) {
            console.log(`${combination} \n WR: ${winRate}% \t Матчей: ${totalMatches} \t Побед: ${totalWins} \t Поражений: ${totalLoses}`);
            console.log('=========================================================');
        }

    } catch (error) {
        console.error('Ошибка при сборе данных:', error.message);
    }
}

function generateCombinations(arr) {
    const result = [];

    const generate = (current, start) => {
        if (current.length > 0) {
            result.push([...current]);
        }
        for (let i = start; i < arr.length; i++) {
            current.push(arr[i]);
            generate(current, i + 1);
            current.pop();
        }
    };

    generate([], 0);
    return result;
}

scrapeData();