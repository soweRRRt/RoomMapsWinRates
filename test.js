const axios = require('axios');

const API_KEY = 'ce5c7213-e7b0-4aa4-b94f-56651e4e4e4a';
const PLAYER_ID = 'c1b04e49-c263-4a43-b442-2b9322977a7c'; // Замените на реальный идентификатор игрока

async function getPlayerInfo(playerId) {
    try {
        const response = await axios.get(`https://open.faceit.com/data/v4/players/${playerId}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Ошибка при получении списка друзей:', error.message);
        return [];
    }
}

async function scrapeData() {
    try {
        const friends = await getPlayerInfo(PLAYER_ID);
        // console.log(friends.friends_ids);
        // const friendIds = new Set(friends.map(friend => friend.player_id));
        const friendIds = new Set(friends.friends_ids);
        // console.log(friendIds);

        const matchesResponse = await axios.get(`https://open.faceit.com/data/v4/players/${PLAYER_ID}/history`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            },
            params: {
                game: 'cs2',
                offset: 0,
                limit: 5000
            }
        });

        const matches = matchesResponse.data.items;

        const playerStats = {};

        for (const match of matches) {
            const matchId = match.match_id;

            const matchDetailsResponse = await axios.get(`https://open.faceit.com/data/v4/matches/${matchId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            const matchDetails = matchDetailsResponse.data;
            const players = matchDetails.teams;

            // console.log(matchDetails);
            // console.log('============');

            let playerTeam, playerTeamString;
            if (players.faction1.roster.some(player => player.player_id === PLAYER_ID)) {
                playerTeam = players.faction1.roster.filter(player => player.player_id !== PLAYER_ID);
                playerTeamString = 'faction1';
            } else {
                playerTeam = players.faction2.roster.filter(player => player.player_id !== PLAYER_ID);
                playerTeamString = 'faction2';
            }

            const filteredPlayerTeam = playerTeam.filter(player => friendIds.has(player.player_id));
            // console.log(friendIds);
            // console.log(filteredPlayerTeam);
            // console.log('=================');
            const playerCombinations = generateCombinations(filteredPlayerTeam);

            const playerName = players.faction1.roster.find(player => player.player_id === PLAYER_ID)?.nickname ||
                players.faction2.roster.find(player => player.player_id === PLAYER_ID)?.nickname;

            const allCombinations = playerCombinations.map(combination => {
                // getPlayerInfo(player.player_id
                const sortedCombination = combination.map(async player => await getPlayerInfo(player.player_id).nickname).sort();
                return [playerName, ...sortedCombination].join(" + ");
            });

            // console.log(allCombinations);

            for (const combination of allCombinations) {
                if (!playerStats[combination]) {
                    playerStats[combination] = { totalMatches: 0, totalWins: 0, totalLoses: 0 };
                }

                playerStats[combination].totalMatches++;

                // console.log(matchDetails.results.winner);
                // console.log(playerTeam);
                // console.log('============');
                if (matchDetails.results.winner === playerTeamString) {
                    playerStats[combination].totalWins++;
                }
                else {
                    playerStats[combination].totalLoses++;
                }
            }
        }

        // console.log('Статистика по комбинациям игроков:');
        // for (const [combination, stats] of Object.entries(playerStats)) {
        //     const winRate = Math.round((stats.totalWins / stats.totalMatches) * 100);
        //     console.log(`${combination} \n WR: ${winRate}% \t Матчей: ${stats.totalMatches} \t Побед: ${stats.totalWins} \t Поражений: ${stats.totalLoses}`);
        //     console.log('===========================');
        // }

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
