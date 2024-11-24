let plotData = [];
let isLoggedIn = false; // Flag für den Login-Status


async function startSpotifyFlow() {
    const clientId = "d4eab2556263494ea3adcd18b31bbd49"; // Replace with your client ID
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!isLoggedIn && !code) {
        // Benutzer zu Spotify weiterleiten, wenn noch nicht eingeloggt
        redirectToAuthCodeFlow(clientId);
    } else if (code) {
        // Wenn ein `code` vorhanden ist, Benutzer als eingeloggt markieren
        isLoggedIn = true;

        // Abrufen der Daten und Aufbau der UI
        const accessToken = await getAccessToken(clientId, code);
        const profile = await fetchProfile(accessToken);
        const topTracks = await fetchUserTopTracks(accessToken);
        populateUI(profile, topTracks, accessToken);
    } else {
        console.log("Bitte melde dich zuerst bei Spotify an.");
    }
}


document.getElementById("start-auth").addEventListener("click", () => {
    startSpotifyFlow();
});




export async function redirectToAuthCodeFlow(clientId) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("scope", "user-read-private user-read-email user-top-read user-read-recently-played"); //added user-read-recently-played user-top-read to get rights to access
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}


export async function getAccessToken(clientId, code) {
    const verifier = localStorage.getItem("verifier");

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("code_verifier", verifier);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const { access_token } = await result.json();
    return access_token;
}

async function fetchProfile(token) {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}


async function fetchUserTopTracks(token) {
    const resultTracks = await fetch("https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=50&offset=0", { //#TODO Auf der finalen Seite möchte ich das mann den Time Horizon einstellen kann
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await resultTracks.json();
}

async function fetchTrackArtist(token, artistID) { //war ohne Stapelverarbeitung
    const resultArtist = await fetch("https://api.spotify.com/v1/artists/" + artistID, {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await resultArtist.json();
}

function getArtistGenre(artistJson) { //war ohne Stapelverarbeitung
    if (artistJson && artistJson.genres) {
        const artistGenre = artistJson.genres;
        return artistGenre;
    } else {
        
        return [];
    }
}

function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

async function fetchArtistsData(token, idChunks) {
    const artistData = [];
    for (const chunk of idChunks) {
        const ids = chunk.join(',');
        const response = await fetch(`https://api.spotify.com/v1/artists?ids=${ids}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        artistData.push(...data.artists);
    }
    return artistData;
}

async function fetchTrackAudioFeatures(token, trackIdList) {
    const ids = trackIdList.join(',');


    const response = await fetch(`https://api.spotify.com/v1/audio-features?ids=${ids}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();

    return data.audio_features;
}

function preparePlotData(topTracks, audioFeatureMap, artistMap) {
    const plotData = topTracks.items.map(track => {
        const audioFeature = audioFeatureMap[track.id];
        const artists = track.artists.map(artist => artistMap[artist.id]?.name || "Unknown").join(", ");
        const genres = track.artists
            .flatMap(artist => artistMap[artist.id]?.genres || [])
            .join(", ");

        return {
            songName: track.name,
            artists,
            genres,
            acousticness: audioFeature?.acousticness || 0,
            danceability: audioFeature?.danceability || 0,
            energy: audioFeature?.energy || 0,
            valence: audioFeature?.valence || 0,
            tempo: audioFeature?.tempo || 0
        };
    });

    return plotData;
}

function create3DScatterPlot(plotData, xProperty, yProperty, zProperty, sizeProperty, colorProperty) {
    const x = plotData.map(d => d[xProperty]);
    const y = plotData.map(d => d[yProperty]);
    const z = plotData.map(d => d[zProperty]);
    const size = plotData.map(d => d[sizeProperty] * 20); // Größe skalieren
    const color = plotData.map(d => d[colorProperty]);

    const trace = {
        x: x,
        y: y,
        z: z,
        mode: "markers",
        marker: {
            size: size,
            color: color,
            colorscale: "Viridis",
            showscale: true,
        },
        text: plotData.map(d => `Song: ${d.songName}<br>Artists: ${d.artists}<br>Genres: ${d.genres}`),
        hoverinfo: "text"
    };

    const layout = {
        scene: {
            xaxis: { title: xProperty },
            yaxis: { title: yProperty },
            zaxis: { title: zProperty }
        },
        margin: { l: 0, r: 0, b: 0, t: 0 }
    };

    Plotly.newPlot("scatter-plot", [trace], layout);
}

document.getElementById("update-plot").addEventListener("click", () => {
    const xProperty = document.getElementById("x-axis").value;
    const yProperty = document.getElementById("y-axis").value;
    const zProperty = document.getElementById("z-axis").value;
    const sizeProperty = document.getElementById("size-axis").value;
    const colorProperty = document.getElementById("color-axis").value;

    create3DScatterPlot(plotData, xProperty, yProperty, zProperty, sizeProperty, colorProperty);
});




async function populateUI(profile, topTracks, token) {
    console.log(profile);
    document.getElementById("displayName").innerText = profile.display_name;

    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar").appendChild(profileImage);
        document.getElementById("imgUrl").innerText = profile.images[0].url;
    }

    document.getElementById("id").innerText = profile.id;
    document.getElementById("email").innerText = profile.email;
    document.getElementById("uri").innerText = profile.uri;
    document.getElementById("uri").setAttribute("href", profile.external_urls.spotify);
    document.getElementById("url").innerText = profile.href;
    document.getElementById("url").setAttribute("href", profile.href);

    const tracksList = document.getElementById("tracks");

    //Hier beginnt der neue Approach zur Stapelverarbeitung
    const artistIds = [];
    topTracks.items.forEach(track => {
        track.artists.forEach(artist => {
            if (!artistIds.includes(artist.id)) {
                artistIds.push(artist.id);
            }
        });
    });

    const trackIds =[];

    topTracks.items.forEach(track => {
        trackIds.push(track.id)
    });

    const artistIdChunks = chunkArray(artistIds, 50);
    const artistsData = await fetchArtistsData(token, artistIdChunks);
    const trackaudioFeatureData = await fetchTrackAudioFeatures(token, trackIds);


    const artistMap = {};
    artistsData.forEach(artist => {
        artistMap[artist.id] = artist;
    });

    
    const audioFeatureMap = {}; //keine Ahnung ob ich das überhaupt brauche
    trackaudioFeatureData.forEach(trackAudioFeature => {
        audioFeatureMap[trackAudioFeature.id] = trackAudioFeature;
    });


    console.log(trackaudioFeatureData);

    for (const track of topTracks.items) {
        const li = document.createElement('li');
        const a = document.createElement("a");
        a.href = track.external_urls.spotify;
        a.textContent = track.name;
        li.appendChild(a);
    
        const subList = document.createElement("ul");
        
        for (const artist of track.artists) {
            const artistData = artistMap[artist.id];
            const genres = artistData.genres.length > 0 ? artistData.genres.join(', ') : "Keine Genres verfügbar";
    
            const artistName = document.createElement("li");
            artistName.textContent = `${artist.name} - Genres: ${genres}`;
            subList.appendChild(artistName);
        }

        // Audio-Features für den Track anzeigen
        const audioFeature = audioFeatureMap[track.id]; // Hole die Audio-Features aus der Map
        if (audioFeature) {
            const audioInfo = document.createElement("li");
            audioInfo.textContent = `Acousticness: ${audioFeature.acousticness}, Danceability: ${audioFeature.danceability}, Energy: ${audioFeature.energy}, Valence: ${audioFeature.valence}, Tempo: ${audioFeature.tempo}`;
            subList.appendChild(audioInfo);
        } else {
            const noAudioInfo = document.createElement("li");
            noAudioInfo.textContent = "Audio-Features nicht verfügbar";
            subList.appendChild(noAudioInfo);
        }

        li.appendChild(subList);
        document.getElementById("tracks").appendChild(li);
    }
    plotData = preparePlotData(topTracks, audioFeatureMap, artistMap); // plotData global setzen
    create3DScatterPlot(plotData, "danceability", "energy", "valence", "tempo", "acousticness");

}
