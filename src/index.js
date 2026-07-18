import { registerBlockType } from '@wordpress/blocks';

import sliderSeekbarJson  from '../element-seekbar.json';
import sliderNumberJson   from '../element-number.json';
import sliderTextJson     from '../element-text.json';
import sliderRadioJson    from '../element-radio.json';
import sliderSelectJson   from '../element-select.json';
import sliderCheckboxJson from '../element-checkbox.json';
import sliderLabelJson    from '../element-label.json';
import buttonsMetadata    from '../buttons-block.json';
import logicMetadata      from '../logic-block.json';
import presetContainerJson from '../preset-container-block.json';
import imageBlockJson      from '../image-block.json';
import arrayListBlockJson  from '../array-list-block.json';
import triggerGroupJson    from '../trigger-group-block.json';

import {
    SeekbarEdit,
    NumberInputEdit,
    TextInputEdit,
    RadioEdit,
    SelectInputEdit,
    CheckboxEdit,
    LabelEdit,
} from './edit';
import ButtonsEdit from './buttons-edit';
import LogicEdit   from './logic-edit';
import { PresetContainerEdit, PresetContainerDynamicSave, PresetContainerSave, LegacyPresetContainerSave, LegacyPresetContainerSavePlain } from './preset-container-edit';
import { ImageBlockEdit, ImageBlockSave, LegacyImageBlockSave, LegacyImageBlockSavePlain } from './image-edit';
import { ArrayListEdit, ArrayListSave, LegacyArrayListSave, LegacyArrayListSavePlain } from './array-list-edit';
import TriggerGroupEdit from './trigger-group-edit';

// ─── Seekbar ──────────────────────────────────────────────────────────────────
registerBlockType(sliderSeekbarJson.name, {
    title: sliderSeekbarJson.title,
    category: sliderSeekbarJson.category,
    icon: sliderSeekbarJson.icon,
    description: sliderSeekbarJson.description,
    attributes: sliderSeekbarJson.attributes,
    edit: SeekbarEdit,
    save: () => null,
});

// ─── Number Input ─────────────────────────────────────────────────────────────
registerBlockType(sliderNumberJson.name, {
    title: sliderNumberJson.title,
    category: sliderNumberJson.category,
    icon: sliderNumberJson.icon,
    description: sliderNumberJson.description,
    attributes: sliderNumberJson.attributes,
    edit: NumberInputEdit,
    save: () => null,
});

// ─── Text Input ───────────────────────────────────────────────────────────────
registerBlockType(sliderTextJson.name, {
    title: sliderTextJson.title,
    category: sliderTextJson.category,
    icon: sliderTextJson.icon,
    description: sliderTextJson.description,
    attributes: sliderTextJson.attributes,
    edit: TextInputEdit,
    save: () => null,
});

// ─── Radio Group ──────────────────────────────────────────────────────────────
registerBlockType(sliderRadioJson.name, {
    title: sliderRadioJson.title,
    category: sliderRadioJson.category,
    icon: sliderRadioJson.icon,
    description: sliderRadioJson.description,
    attributes: sliderRadioJson.attributes,
    edit: RadioEdit,
    save: () => null,
});

// ─── Select ───────────────────────────────────────────────────────────────────
registerBlockType(sliderSelectJson.name, {
    title: sliderSelectJson.title,
    category: sliderSelectJson.category,
    icon: sliderSelectJson.icon,
    description: sliderSelectJson.description,
    attributes: sliderSelectJson.attributes,
    edit: SelectInputEdit,
    save: () => null,
});

// ─── Checkbox ─────────────────────────────────────────────────────────────────
registerBlockType(sliderCheckboxJson.name, {
    title: sliderCheckboxJson.title,
    category: sliderCheckboxJson.category,
    icon: sliderCheckboxJson.icon,
    description: sliderCheckboxJson.description,
    attributes: sliderCheckboxJson.attributes,
    edit: CheckboxEdit,
    save: () => null,
});

// ─── Label ────────────────────────────────────────────────────────────────────
registerBlockType(sliderLabelJson.name, {
    title: sliderLabelJson.title,
    category: sliderLabelJson.category,
    icon: sliderLabelJson.icon,
    description: sliderLabelJson.description,
    attributes: sliderLabelJson.attributes,
    edit: LabelEdit,
    save: () => null,
});

// ─── Button Group ─────────────────────────────────────────────────────────────
registerBlockType(buttonsMetadata.name, {
    title: buttonsMetadata.title,
    category: buttonsMetadata.category,
    icon: buttonsMetadata.icon,
    description: buttonsMetadata.description,
    attributes: buttonsMetadata.attributes,
    edit: ButtonsEdit,
    save: () => null,
});

// ─── Logic Block ──────────────────────────────────────────────────────────────
registerBlockType(logicMetadata.name, {
    title: logicMetadata.title,
    category: logicMetadata.category,
    icon: logicMetadata.icon,
    description: logicMetadata.description,
    attributes: logicMetadata.attributes,
    edit: LogicEdit,
    save: () => null,
});

registerBlockType(presetContainerJson.name, {
    title: presetContainerJson.title,
    category: presetContainerJson.category,
    icon: presetContainerJson.icon,
    description: presetContainerJson.description,
    attributes: presetContainerJson.attributes,
    edit: PresetContainerEdit,
    save: PresetContainerDynamicSave,
    deprecated: [
        {
            attributes: presetContainerJson.attributes,
            save: PresetContainerSave,
        },
        {
            attributes: presetContainerJson.attributes,
            save: LegacyPresetContainerSave,
        },
        {
            attributes: presetContainerJson.attributes,
            save: LegacyPresetContainerSavePlain,
        },
    ],
});

// ─── Image Block ─────────────────────────────────────────────────────────────
registerBlockType(imageBlockJson.name, {
    title: imageBlockJson.title,
    category: imageBlockJson.category,
    icon: imageBlockJson.icon,
    description: imageBlockJson.description,
    attributes: imageBlockJson.attributes,
    edit: ImageBlockEdit,
    save: ImageBlockSave,
    deprecated: [
        {
            attributes: imageBlockJson.attributes,
            save: LegacyImageBlockSave,
        },
        {
            attributes: imageBlockJson.attributes,
            save: LegacyImageBlockSavePlain,
        },
    ],
});

// ─── Array List Block ────────────────────────────────────────────────────────
registerBlockType(arrayListBlockJson.name, {
    title: arrayListBlockJson.title,
    category: arrayListBlockJson.category,
    icon: arrayListBlockJson.icon,
    description: arrayListBlockJson.description,
    attributes: arrayListBlockJson.attributes,
    edit: ArrayListEdit,
    save: ArrayListSave,
    deprecated: [
        {
            attributes: arrayListBlockJson.attributes,
            save: LegacyArrayListSave,
        },
        {
            attributes: arrayListBlockJson.attributes,
            save: LegacyArrayListSavePlain,
        },
    ],
});

// ─── Trigger Group ───────────────────────────────────────────────────────────
registerBlockType(triggerGroupJson.name, {
    title: triggerGroupJson.title,
    category: triggerGroupJson.category,
    icon: triggerGroupJson.icon,
    description: triggerGroupJson.description,
    attributes: triggerGroupJson.attributes,
    edit: TriggerGroupEdit,
    save: () => null,
});
