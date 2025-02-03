document.getElementById('fetchStats').addEventListener('click', async () => {
    const loader = document.getElementById('loader');
    const resultDiv = document.getElementById('result');

    try {
        loader.style.display = 'block';
        resultDiv.innerHTML = '';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const matchId = tab.url.match(/room\/([^\/]*)/)?.[1];

        if (!matchId) throw new Error('Invalid FACEIT room URL');

        const apiKey = 'ce5c7213-e7b0-4aa4-b94f-56651e4e4e4a';

        const matchResponse = await fetch(`https://open.faceit.com/data/v4/matches/${matchId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!matchResponse.ok) throw new Error('Failed to fetch match data');
        const matchData = await matchResponse.json();

        const team1 = matchData.teams.faction1;
        const team2 = matchData.teams.faction2;

        const allPlayers = [...team1.roster, ...team2.roster];
        const playersData = await Promise.all(allPlayers.map(async player => {
            try {
                const params = new URLSearchParams({ offset: 0, limit: 50 });
                const response = await fetch(
                    `https://open.faceit.com/data/v4/players/${player.player_id}/games/cs2/stats?${params}`,
                    { headers: { 'Authorization': `Bearer ${apiKey}` } }
                );

                if (!response.ok) return null;
                const stats = await response.json();
                return { ...player, stats };
            } catch (error) {
                console.error(`Error fetching stats for ${player.nickname}:`, error);
                return null;
            }
        }));

        const team1Stats = analyzeTeamStats(team1, playersData);
        const team2Stats = analyzeTeamStats(team2, playersData);

        resultDiv.innerHTML = `
        <div class="teams-container">
          ${formatStats(team1Stats, team1.name || 'Team 1')}
          ${formatStats(team2Stats, team2.name || 'Team 2')}
        </div>
      `;

    } catch (error) {
        resultDiv.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    } finally {
        loader.style.display = 'none';
    }
});

document.getElementById('fetchPlayerStats').addEventListener('click', async () => {
    const loader = document.getElementById('loader');
    const resultDiv = document.getElementById('result');

    try {
        loader.style.display = 'block';
        resultDiv.innerHTML = '';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const matchId = tab.url.match(/room\/([^\/]*)/)?.[1];

        if (!matchId) throw new Error('Invalid FACEIT room URL');

        let playerNick;

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                const element = document.querySelector('.Text-sc-67635c04-0.Nickname__Name-sc-20a28656-1.DBiSW.irWoww');
                return element ? element.innerText : null;
            }
        }, (results) => {
            if (results && results[0] && results[0].result) {
                playerNick = results[0].result;
            } else {
                playerNick = null;
            }
        });

        const apiKey = 'ce5c7213-e7b0-4aa4-b94f-56651e4e4e4a';
        const playerCache = {};
        const limiter = {
            schedule: async (fn) => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return fn();
            }
        };

        const resPlayerId = await limiter.schedule(() => fetch(`https://open.faceit.com/data/v4/players?nickname=${playerNick}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        }));

        if (!resPlayerId.ok) throw new Error('Failed to fetch player info');
        const resPlayer = await resPlayerId.json();
        const PLAYER_ID = resPlayer.player_id;

        async function getPlayerInfo(playerId) {
            if (playerCache[playerId]) return playerCache[playerId];

            try {
                const response = await limiter.schedule(() => fetch(`https://open.faceit.com/data/v4/players/${playerId}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                }));

                if (!response.ok) throw new Error('Failed to fetch player info');
                const data = await response.json();
                playerCache[playerId] = data;
                return data;
            } catch (error) {
                console.error('Error fetching player info:', error.message);
                return null;
            }
        }

        const friends = await getPlayerInfo(PLAYER_ID);
        const friendIds = new Set(friends.friends_ids);

        const matchesResponse = await fetch(`https://open.faceit.com/data/v4/players/${PLAYER_ID}/history?game=cs2&offset=0&limit=100`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!matchesResponse.ok) throw new Error('Failed to fetch match history');
        const matches = await matchesResponse.json();

        const playerStats = {};

        const matchDetailsPromises = matches.items.map(async (match) => {
            const matchId = match.match_id;

            const matchDetailsResponse = await limiter.schedule(() => fetch(`https://open.faceit.com/data/v4/matches/${matchId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            }));

            if (!matchDetailsResponse.ok) return null;
            return matchDetailsResponse.json();
        });

        const matchDetailsResults = await Promise.all(matchDetailsPromises);

        for (const matchDetails of matchDetailsResults) {
            if (!matchDetails) continue;

            const players = matchDetails.teams;
            let playerTeam, playerTeamString;

            if (players.faction1.roster.some(player => player.player_id === PLAYER_ID)) {
                playerTeam = players.faction1.roster.filter(player => player.player_id !== PLAYER_ID);
                playerTeamString = 'faction1';
            } else {
                playerTeam = players.faction2.roster.filter(player => player.player_id !== PLAYER_ID);
                playerTeamString = 'faction2';
            }

            const filteredPlayerTeam = playerTeam.filter(player => friendIds.has(player.player_id));
            const allCombinationsPromises = filteredPlayerTeam.map(async player => {
                const playerInfo = await getPlayerInfo(player.player_id);
                return playerInfo ? playerInfo.nickname : null;
            });

            const allCombinations = await Promise.all(allCombinationsPromises);
            const myPlayer = await getPlayerInfo(PLAYER_ID);

            const combination = [myPlayer.nickname, ...allCombinations.filter(nickname => nickname !== null).sort()].join(" + ");

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

        resultDiv.innerHTML = `
        <h3>Player Combination Stats</h3>
        ${sortedStats.map(({ combination, totalMatches, totalWins, winRate, totalLoses }) => `
          <div class="map-stats">
            <div class="stats-item"><strong>${combination}</strong></div>
            <div class="stats-item">Matches: ${totalMatches}</div>
            <div class="stats-item">Wins: ${totalWins}</div>
            <div class="stats-item">Loses: ${totalLoses}</div>
            <div class="stats-item">Win Rate: ${winRate}%</div>
          </div>
        `).join('')}
      `;

    } catch (error) {
        resultDiv.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    } finally {
        loader.style.display = 'none';
    }
});

function analyzeTeamStats(team, playersData) {
    const mapStats = {};

    playersData.filter(p => p && team.roster.some(tp => tp.player_id === p.player_id))
        .forEach(player => {
            player.stats.items.forEach(match => {
                if (isValidMatch(match)) {
                    const mapName = match.stats.Map;
                    const kd = parseFloat(match.stats['K/D Ratio']) || 0;
                    const isWin = match.stats.Result === '1';

                    if (!mapStats[mapName]) {
                        mapStats[mapName] = {
                            matches: 0,
                            wins: 0,
                            kdSum: 0,
                            players: new Set()
                        };
                    }

                    mapStats[mapName].matches++;
                    mapStats[mapName].kdSum += kd;
                    mapStats[mapName].players.add(player.nickname);
                    if (isWin) mapStats[mapName].wins++;
                }
            });
        });

    return mapStats;
}

function isValidMatch(match) {
    return (
        match.stats['Game Mode'] === '5v5' &&
        match.stats.Rounds > 16 &&
        !['0', '12'].includes(match.stats['First Half Score'])
    );
}

function formatStats(stats, teamName) {
    return `
      <div class="team-column">
        <div class="team-name">${teamName}</div>
        ${Object.entries(stats).map(([mapName, data]) => `
          <div class="map-stats">
            <div class="stats-item"><strong>${mapName}</strong></div>
            <div class="stats-item">Matches: ${data.matches}</div>
            <div class="stats-item">Win Rate: ${((data.wins / data.matches) * 100 || 0).toFixed(1)}%</div>
            <div class="stats-item">Avg KD: ${(data.kdSum / data.matches || 0).toFixed(2)}</div>
            <div class="stats-item">Players: ${Array.from(data.players).join(', ')}</div>
          </div>
        `).join('')}
      </div>
    `;
}