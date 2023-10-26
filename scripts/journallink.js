export class JournalLink {
    re = /@(\w+)\[([\w| |\.]+)\]/g;

    entityMap = {
    };

    elementSelectors = [
        '.editor-content[data-edit="system.description.value"]',
        '.editor-content[data-edit="system.details.biography.value"]'
    ];

    async updateJournalEntryPage(entity, change) {
        let text = change.text;
        if (text !== undefined) {
            await this.update(entity, 'JournalEntryPage', text.content || '', false);
        } else if (change.flags?.['journal-backlinks']?.['-=sync'] === null) {
            await this.update(entity, 'JournalEntryPage', entity.text.content || '', true);
        }
    }

    async updateActor(entity, change) {
        let content = change.system?.details?.biography?.value;
        if (content !== undefined) {
            await this.update(entity, 'Actor', content || '', false);
        } else if (change.flags?.['journal-backlinks']?.['-=sync'] === null) {
            await this.update(entity, 'Actor', entity.system.details.biography.value || '', true);
        }
    }

    async updateItem(entity, change) {
        let content = change.system?.description?.value;
        if (content !== undefined) {
            await this.update(entity, 'Item', content || '', false);
        } else if (change.flags?.['journal-backlinks']?.['-=sync'] === null) {
            await this.update(entity, 'Item', entity.system.description.value || '', true);
        }
    }

    async update(entity, entityType, content, force) {
        if (!force && !game.settings.get('journal-backlinks', 'rebuildOnSave')) {
            this.log('not updating ' + entityType + ' ' + entity.name + ' as rebuildOnSave is false');
            return;
        }
        this.log('updating ' + entityType + ' ' + entity.name + ' (' + entity.uuid + ')');
        let references = this.references(content);
        let existing = entity.flags['journal-backlinks']?.references || [];

        let updated = [];

        for (let reference of references) {
            if (reference.startsWith('.')) {
                // a local reference, need to reconstruct the global UUID
                reference = entity.uuid.split('.').slice(0, 2).join('.') + '.' + entityType + reference;
            }
            // if we've linked something multiple times in this entity
            if (updated.includes(reference)) {
                this.debug(reference + ' is already updated, skipping');
                continue;
            }
            updated.push(reference);

            if (existing.includes(reference)) {
                this.debug(reference + ' is already referenced, skipping');
                continue;
            }

            var referenced = game.documentIndex.uuids[reference]?.leaves[0]?.entry;

            if (!referenced) {
                this.debug('no referenced entity ' + reference + '; skipping');
                continue;
            }

            this.debug('adding to referencedBy in ' + referenced.name);
            let links = await referenced.getFlag('journal-backlinks', 'referencedBy') || {};
            let linksOfType = links[entityType] || [];
            if (linksOfType.includes(entity.uuid)) {
                this.debug(entityType + ' ' + entity.uuid + ' already exists, skipping');
                continue;
            }
            linksOfType.push(entity.uuid);

            links[entityType] = linksOfType;
            referenced.setFlag('journal-backlinks', 'referencedBy', duplicate(links));
        }

        for (let outdated of existing.filter(v => !updated.includes(v))) {
            let target = game.documentIndex.uuids[outdated].leaves[0].entry;
            if (!target) {
                this.debug('outdated entity ' + type + ' ' + outdated + ' does not exist');
                continue;
            }

            let links = await target.getFlag('journal-backlinks', 'referencedBy');
            let linksOfType = links[entityType] || [];
            let outdatedIdx = linksOfType.indexOf(entity.uuid);
            if (outdatedIdx > -1) {
                this.debug('removing outdated entity ' + entityType + ' ' + entity.name
                           + ' from ' + target.name);
                linksOfType.splice(outdatedIdx, 1);

                if (linksOfType.length) {
                    links[entityType] = linksOfType;
                } else {
                    delete links[entityType];
                    links['-=' + entityType] = null;
                }

                let copy = duplicate(links);
                await target.setFlag('journal-backlinks', 'referencedBy', copy);
            }
        }
        await entity.setFlag('journal-backlinks', 'references', updated);
    }

    includeJournalPageLinks(sheet, html, data) {
        this.includeLinks(html, data.document);
    }

    includeActorLinks(sheet, html, data) {
        this.includeLinks(html, data.actor);
    }

    includeItemLinks(sheet, html, data) {
        this.includeLinks(html, data.item);
    }

    includeLinks(html, entityData) {
        let links = entityData.flags?.['journal-backlinks']?.['referencedBy'] || {};
        if (Object.keys(links).length === 0)
            return;

        this.log('appending links to ' + entityData.name);

        let linksDiv = $('<div class="journal-backlinks"></div>');
        let heading = document.createElement(game.settings.get('journal-backlinks', 'headingTag'));
        heading.append('Linked from');
        linksDiv.append(heading);
        let linksList = $('<ul></ul>');
        for (const [type, values] of Object.entries(links)) {
            for (let value of values) {
                let entity = game.documentIndex.uuids[value]?.leaves[0]?.entry;
                if (!entity) {
		    // this is a bug, but best to try to work around it and log
                    this.log('ERROR | unable to find entity (try the sync button?)');
		    continue;
                }
                if (!entity.testUserPermission(game.users.current, game.settings.get('journal-backlinks', 'minPermission')))
                    continue;
                this.debug('adding link from ' + type + ' ' + entity.name);
                let link = $('<a class="content-link" draggable="true"></a>');
                link.attr('data-type', type);
                link.attr('data-uuid', value);

                let icon = 'fas ';
                switch (type) {
                case 'JournalEntryPage':
                    icon += 'fa-file-lines';
                    break;
                case 'Actor':
                    icon += 'fa-user';
                    break;
                case 'Item':
                    icon += 'fa-suitcase';
                    break;
                case 'RollTable':
                    icon == 'fa-th-list';
                    break;
                }
                link.append($('<i class="' + icon + '"></i>'));
                link.append(' ' + entity.name);

                let p = $('<p></p>');
                p.append(link);

                let li = $('<li></li>');
                li.append(p);
                linksList.append(li);
            }
        }
        linksDiv.append(linksList);

        let element = this.getElementToModify(html);
        if (element === undefined || element.length === 0) {
            // the callback is (presumably) directly on what we want to modify
            html.parent().append(linksDiv);
        }
        else {
            // the callback is on a parent of what we want to modify
            element.append(linksDiv);
        }
    }

    // clears and recreates references
    async sync() {
        this.log('syncing links...');

        let document_types = ['JournalEntryPage', 'Actor', 'Item', 'RollTable'];
        let entries = game.documentIndex.lookup('', {
            documentTypes: document_types,
            limit: Number.MAX_SAFE_INTEGER
        });

        for (let type of document_types) {
            this.log('wiping referencedBy for ' + type);
            for (const document of entries[type]) {
                let entity = document.entry;
                if (entity.flags !== undefined) {
                    this.debug('wiping referencedBy for ' + entity.name);
                    await entity.unsetFlag('journal-backlinks', 'referencedBy');
                }
            }
        }

        // this will rebuild the references, so we need to have referencedBy wiped first
        for (let type of document_types) {
            this.log('wiping references and refreshing for ' + type);
            for (const document of entries[type]) {
                let entity = document.entry;
                if (entity.flags !== undefined) {
                    this.debug('wiping references and refreshing for ' + entity.name);
                    await entity.unsetFlag('journal-backlinks', 'references');
                    await entity.unsetFlag('journal-backlinks', 'sync');
                }
            }
        }

        this.log('links synced');
    }

    references(text) {
        return Array.from(text.matchAll(this.re)).map(
            m => {
                let link_type = m[1];
                if (link_type === "UUID") {
                    return m[2];
                } else {
                    return link_type + "." + m[2];
                }
            }
        );
    }

    getElementToModify(html) {
        for (let selector of this.elementSelectors) {
            let element = html.find(selector);

            if (element.length === 1)
                return element;
        }

        this.log('ERROR | unable to find element to modify');
        return undefined;
    }

    log(text) {
        console.log('journal-backlinks | ' + text);
    }

    debug(text) {
        if (CONFIG.debug.JournalLinks)
            this.log('DEBUG | ' + text);
    }
}
