import { JournalLink } from './journallink.js';
import { Sync } from './sync.js';

// bump this to cause a sync on page load (one time)
const SYNC_VERSION = 1;

const MODULE_NAME = 'journal-backlinks';
const NAME = 'Journal Backlinks';

Hooks.on("init", () => {
    console.log('journal-backlinks | initializing');
    let modulename = MODULE_NAME;
    game.settings.register(MODULE_NAME, 'rebuildOnSave', {
        name: game.i18n.localize('JournalBacklinks.rebuildOnSave.name'),
        hint: game.i18n.localize('JournalBacklinks.rebuildOnSave.hint'),
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.register(MODULE_NAME, 'headingTag', {
        name: game.i18n.localize('JournalBacklinks.headingTag.name'),
        hint: game.i18n.localize('JournalBacklinks.headingTag.hint'),
        scope: 'world',
        config: true,
        type: String,
        default: 'h2'
    });
    const permissions = Object.fromEntries(Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS).map(([k, v]) => [v, game.i18n.localize('PERMISSION.'+k)]));
    game.settings.register(MODULE_NAME, 'minPermission', {
        name: game.i18n.localize('JournalBacklinks.minPermission.name'),
        hint: game.i18n.localize('JournalBacklinks.minPermission.hint'),
        scope: 'world',
        config: true,
        type: Number,
        choices: permissions,
        default: 1
    });
    game.settings.register(MODULE_NAME, 'debug', {
        name: game.i18n.localize('JournalBacklinks.debug.name'),
        scope: 'client',
        config: true,
        type: Boolean,
        default: false
    });
    game.settings.register(MODULE_NAME, 'lastSyncedVersion', {
        name: 'Last synced version',
        hint: 'If we perform a bugfix that would benefit from resyncing, SYNC_VERSION will be out of -- forgive me -- sync, indicating we should perform a sync',
        scope: 'world',
        config: false,
        type: Number,
        default: 0
    });
    game.settings.registerMenu(MODULE_NAME, 'syncButton', {
        name: game.i18n.localize('JournalBacklinks.syncButton.name'),
        label: game.i18n.localize('JournalBacklinks.syncButton.label'),
        icon: 'fas fa-sync-alt',
        type: Sync,
        restricted: true
    });

    let jl = new JournalLink();
    game.JournalLink = jl;
    CONFIG.debug.JournalLinks = game.settings.get(MODULE_NAME, 'debug');
    Hooks.on('createJournalEntryPage', game.JournalLink.initNewPage.bind(jl));
    // things to run on update
    // https://foundryvtt.com/api/modules/hookEvents.html#preUpdateDocument
    Hooks.on('preUpdateJournalEntryPage', game.JournalLink.updateJournalEntryPage.bind(jl));
    Hooks.on('preUpdateActor', game.JournalLink.updateActor.bind(jl));
    Hooks.on('preUpdateItem', game.JournalLink.updateItem.bind(jl));       

    // things to run on render
    // https://foundryvtt.com/api/modules/hookEvents.html#renderApplication
    Hooks.on('renderJournalPageSheet', game.JournalLink.includeJournalPageLinks.bind(jl));
    Hooks.on('renderActorSheet', game.JournalLink.includeActorLinks.bind(jl));
    Hooks.on('renderItemSheet', game.JournalLink.includeItemLinks.bind(jl));

    // initial sync
    Hooks.on('ready', () => {
        if (game.settings.get(MODULE_NAME, 'lastSyncedVersion') < SYNC_VERSION) {
            console.log('journal-backlinks | performing sync...');
            game.JournalLink.sync();
            game.settings.set(MODULE_NAME, 'lastSyncedVersion', SYNC_VERSION);
        }
    });
});
