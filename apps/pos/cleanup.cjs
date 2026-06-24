const fs = require('fs');
const path = require('path');

const dir = 'd:\\xampp\\htdocs\\nextpos\\apps\\pos\\src\\pages\\saas';

const replacements = [
    {
        find: /bg-slate-900\/40 backdrop-blur-3xl/g,
        replace: 'bg-white dark:bg-slate-900 shadow-sm'
    },
    {
        find: /bg-slate-900\/40 backdrop-blur-xl/g,
        replace: 'bg-white dark:bg-slate-900 shadow-sm'
    },
    {
        find: /bg-slate-900\/40 backdrop-blur-md/g,
        replace: 'bg-white dark:bg-slate-900 shadow-sm'
    },
    {
        find: /bg-slate-900\/40/g,
        replace: 'bg-white dark:bg-slate-900 shadow-sm'
    },
    {
        find: /rounded-\[48px\]/g,
        replace: 'rounded-2xl'
    },
    {
        find: /rounded-\[40px\]/g,
        replace: 'rounded-2xl'
    },
    {
        find: /rounded-\[32px\]/g,
        replace: 'rounded-2xl'
    },
    {
        find: /rounded-\[24px\]/g,
        replace: 'rounded-xl'
    },
    {
        find: /rounded-\[20px\]/g,
        replace: 'rounded-xl'
    },
    {
        find: /rounded-\[18px\]/g,
        replace: 'rounded-xl'
    },
    {
        find: /border-white\/5/g,
        replace: 'border-slate-200 dark:border-slate-800'
    },
    {
        find: /border-white\/10/g,
        replace: 'border-slate-200 dark:border-slate-800'
    },
    {
        find: /shadow-2xl/g,
        replace: 'shadow-sm'
    },
    {
        find: /text-4xl font-black text-white tracking-tighter uppercase italic drop-shadow-2xl/g,
        replace: 'text-2xl font-bold text-slate-800 dark:text-white'
    },
    {
        find: /text-\[11px\] text-slate-500 font-bold uppercase tracking-\[0.2em\] max-w-md opacity-60/g,
        replace: 'text-sm text-slate-500 max-w-md'
    },
    {
        find: /text-white/g,
        replace: 'text-slate-800 dark:text-white'
    },
    {
        find: /text-slate-800 dark:text-slate-800 dark:text-white/g,
        replace: 'text-slate-800 dark:text-white'
    },
    {
        find: /bg-slate-800\/50/g,
        replace: 'bg-slate-50 dark:bg-slate-800/50'
    },
    {
        find: /bg-slate-800/g,
        replace: 'bg-slate-100 dark:bg-slate-800'
    },
    {
        find: /text-slate-300/g,
        replace: 'text-slate-600 dark:text-slate-400'
    },
    {
        find: /text-slate-400/g,
        replace: 'text-slate-500 dark:text-slate-400'
    }
];

function walkDir(d) {
    fs.readdirSync(d).forEach(file => {
        const fullPath = path.join(d, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            // Only process if it matches one of our heavy classes
            replacements.forEach(r => {
                if (content.match(r.find)) {
                    content = content.replace(r.find, r.replace);
                    modified = true;
                }
            });

            // Prevent double replacements (e.g. text-white becoming text-slate-800 dark:text-slate-800 dark:text-white)
            content = content.replace(/text-slate-800 dark:text-slate-800 dark:text-white/g, 'text-slate-800 dark:text-white');

            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Updated:', file);
            }
        }
    });
}

walkDir(dir);
console.log('Done.');
