const transcriptElement = document.querySelector(".transcript");
const discussMessagesElement = document.querySelector(".discuss-messages");
const userInputElement = document.querySelector(".user-input");

let player;
let active;
let progressInterval;
let watchingAnalyticsInterval;
let lastTranscriptScroll = 0;
let lastDiscussScroll = 0;

fetch(`/video-data/${VIDEO_ID}`)
    .then((response) => response.json())
    .then(chapters => {
        chapters.forEach((chapter, chapter_id) => {
            const chapterContainer = document.createElement("div");
            chapterContainer.dataset.chapterId = chapter_id;

            const chapterTitleElement = document.createElement("h2");
            chapterTitleElement.classList.add("chapter", "seekable");
            chapterTitleElement.textContent = chapter.title;
            chapterTitleElement.onclick = function() {
                player.seekTo(chapter.transcript[0].start / 1000);
                player.playVideo();
            };
            chapterContainer.appendChild(chapterTitleElement)

            chapter.transcript.forEach(segment => {
                const segmentElement = document.createElement("span");
                segmentElement.classList.add("transcript-section", "seekable");
                segmentElement.dataset.id = segment.id;
                segmentElement.dataset.start = segment.start;
                segmentElement.dataset.stop = segment.stop;
                segmentElement.textContent = segment.text + " ";
                segmentElement.onclick = function() {
                    player.seekTo(segment.start / 1000);
                    player.playVideo();
                };
                chapterContainer.appendChild(segmentElement);
            });

            const questionElement = document.createElement("div");
            questionElement.classList.add("question");
            questionElement.classList.add("unanswered");
            questionElement.dataset.start = chapter.transcript[chapter.transcript.length - 1].stop;
            questionElement.textContent = chapter.questions[0];
            chapterContainer.appendChild(questionElement);

            transcriptElement.appendChild(chapterContainer);
        });
    });


let tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
let firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: VIDEO_ID,
        playerVars: {
          rel: 0,
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
        }
    });
}


function setActive(element) {
    if (active === element) return;

    active?.classList.remove('highlight');
    active = element;
    active?.classList.add('highlight');
}


function pushAnalytics(event) {
    let postData = {
        session_id: SESSION_ID,
        when: parseInt(player.getCurrentTime() * 1000),
        chapter: parseInt(active?.parentElement.dataset.chapterId),
        ...event,
    };
    fetch(`/analytics/${VIDEO_ID}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
    });
}


function updateHighlightedSection(currentTime) {
    let transcriptSections = document.querySelectorAll('.transcript-section');

    for (let section of transcriptSections) {
        let start = parseInt(section.dataset.start);
        let stop = parseInt(section.dataset.stop);

        if (currentTime >= start && currentTime < stop) {
            setActive(section);

            let sectionRect = section.getBoundingClientRect();
            let transcriptRect = transcriptElement.getBoundingClientRect();
            let visible = sectionRect.top >= transcriptRect.top && sectionRect.bottom <= transcriptRect.bottom;
            if (lastTranscriptScroll + 5000 < Date.now() && !visible) {
                transcriptElement.scroll({
                    top: section.offsetTop - (transcriptElement.offsetTop + transcriptElement.clientHeight / 2),
                    behavior: 'smooth'
                })
            }

            return;
        }

    }
}


function addMessage(message="", type="user") {
    let messageElement = document.createElement("div");
    messageElement.classList.add("message");
    messageElement.dataset.type = type;
    messageElement.textContent = message;
    discussMessagesElement.appendChild(messageElement);
    discussMessagesElement.scroll({
        top: discussMessagesElement.scrollHeight,
        behavior: 'smooth'
    })

    if (type !== "ai") {
        pushAnalytics({event: 'message', type: type, text: message});
    }

    return messageElement;
}


function assessQuestion(currentTime) {
    let unansweredQuestion = transcriptElement.querySelector('.unanswered');
    if (!unansweredQuestion) return;

    let askWhen = parseInt(unansweredQuestion.dataset.start);
    if (currentTime > askWhen) {
        addMessage(unansweredQuestion.textContent, "assessment");

        transcriptElement.scroll({
            top: unansweredQuestion.offsetTop - (transcriptElement.offsetTop + transcriptElement.clientHeight / 2),
            behavior: 'smooth',
        })

        setActive(unansweredQuestion);
        player.playVideo();
    }

    // for (let question of unansweredQuestions) {
    //     let askWhen = parseInt(question.nextElementSibling.dataset.start);
    //     console.log(currentTime, askWhen);
    //     if (currentTime > askWhen) {
    //         addMessage(question.textContent, "assessment");
    //     }
    //     question.classList.remove('unanswered');
    // }

}


function progressLoop() {
    let currentTime = player.getCurrentTime() * 1000;

    if (active?.classList.contains('question')) {
        if (player.getCurrentTime() * 1000 > parseInt(active.dataset.start))
            player.pauseVideo();
            // player.seekTo(parseInt(active.dataset.start) / 1000);
        return;
    }

    updateHighlightedSection(currentTime);
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
       assessQuestion(currentTime);
    }
}

function onPlayerReady(event) {
    progressInterval = setInterval(progressLoop, 100);
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.PLAYING) {
        pushAnalytics({event: 'video', type: 'playing'});
    } else if (event.data == YT.PlayerState.PAUSED) {
        pushAnalytics({event: 'video', type: 'paused'});
    } else if (event.data == YT.PlayerState.ENDED) {
        pushAnalytics({event: 'video', type: 'ended'});
    }
}

transcriptElement.addEventListener('scroll', () => {
    lastTranscriptScroll = Date.now();
})

discussMessagesElement.addEventListener('scroll', () => {
    lastDiscussScroll = Date.now();
})

userInputElement.addEventListener('keydown', function (event) {
    player.pauseVideo();

    if (event.key === 'Enter') {
        event.preventDefault();

        let input = userInputElement.value;
        userInputElement.value = "";

        addMessage(input, "user");

        let messages = [];
        document.querySelectorAll('.message').forEach(message => {
            messages.push({
              type: message.dataset.type,
              text: message.textContent,
            });
        });

        let postData = {
            messages: messages,
            when: parseInt(player.getCurrentTime() * 1000),
            chapter: parseInt(active?.parentElement.dataset.chapterId),
        };

        let endpoint = active?.classList.contains('question') ? 'assess' : 'discuss';

        fetch(`/${endpoint}/${VIDEO_ID}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        })
        .then((response) => {
            const utf8Decoder = new TextDecoder('utf-8');
            const reader = response.body.getReader();

            let aiMessage = addMessage("", "ai");

            return reader.read().then(function processText({ done, value }) {
                if (done) {
                    let aiMessageAnalytics = {event: 'message', type: 'ai', text: aiMessage.textContent};
                    if (aiMessage.classList.contains('success')) {
                        aiMessageAnalytics.success = true;
                    }
                    pushAnalytics(aiMessageAnalytics);
                    return;
                }
                const chunk = utf8Decoder.decode(value);
                aiMessage.textContent += chunk;
                if (aiMessage.textContent.includes("###SUCCESS###")) {
                    aiMessage.classList.add("success");
                    aiMessage.textContent = aiMessage.textContent.replace("###SUCCESS###", "");

                    active.classList.remove('unanswered');
                    active.classList.add('answered');
                    setActive(null);
                    player.playVideo();
                }
                discussMessagesElement.scrollTop = discussMessagesElement.scrollHeight;
                // discussMessagesElement.scroll({
                //     top: discussMessagesElement.scrollHeight,
                //     behavior: 'smooth'
                // });
                return reader.read().then(processText);
            });
        })
        .catch(error => {
            console.error('Error fetching:', error);
        });
    }
});
