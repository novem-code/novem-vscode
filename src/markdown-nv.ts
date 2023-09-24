const simple_sections = ['author', 'vis'];
const complex_sections = ['callout', 'paragraph', 'preview'];

function container(
    state: any,
    startLine: number,
    endLine: number,
    silent: boolean,
) {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];

    let line: string = state.src.slice(pos, max);
    if (line.length < 4) return false;

    const open_tag = /{{ \w+/.exec(line);
    const close_tag = state.src.slice(pos).search(/}}/);

    if (!open_tag || close_tag === -1) return false;

    const tag = open_tag[0].slice(3);

    const is_simple = simple_sections.some((section) =>
        section.startsWith(tag),
    );

    const content = state.src.slice(pos + 3 + tag.length, pos + close_tag);

    if (is_simple) {
        //let token = state.push('container', 'pre', 1);
        //token.content = tag;
        const skip =
            (state.src.slice(pos, pos + close_tag).match(/\n/g) || []).length +
            1;
        state.line = startLine + skip;

        console.log(
            `found simple tag '${tag}' with content ${content}, total ${skip} lines`,
        );
    } else {
        let endLine = 0;
        for (let line = startLine; line < state.lineMax; line++) {
            const l: string = state.src.slice(
                state.bMarks[line] + state.tShift[line],
                state.eMarks[line],
            );
            if (l.search(/{{ \/\w+\ }}/) >= 0) {
                endLine = line;
                break;
            }
        }

        if (endLine === 0) throw new Error('Could not find end of complex tag');

        console.log({
            start: pos + close_tag + 3,
            end: state.eMarks[endLine - 1],
            startLine,
            endLine,
        });
        const body = state.src.slice(
            pos + close_tag + 3,
            state.eMarks[endLine - 1],
        );
        console.log(
            `found hard tag '${tag}' with content ${content} and body ${body}`,
        );

        state.line = endLine + 1;
    }

    if (!silent) {
        // emit markup here
        /*
        let token = state.push('container', 'div', 1);
        token.markup = '{{';
        token.info = '';
        token.block = true;
        token.map = [startLine, state.line];

        token = state.push('text', '', 0);
        token.content = content;
        token.block = true;
        token.map = [startLine, state.line];

        token = state.push('container', 'div', -1);
        token.markup = '}}';
        token.info = '';
        token.block = true;
        */
    }

    return true;
}

export default function (md: any) {
    md.block.ruler.before('fence', 'container', container, {
        alt: ['paragraph', 'reference', 'blockquote', 'list'],
    });
}
